"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "@/lib/evm/erc20";
import { fetchTokenMeta, formatUnits } from "@/lib/tokens";
import type { TokenVaultDisplay } from "@/app/types/token.types";
import type { TokenVaultView } from "@/lib/evm/types";

export interface UserTokenInfo {
  token: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}

/**
 * Display data for the wills's escrowed tokens, plus the user's own balances.
 *
 * The Solana version had to reconcile three account layers per token — the
 * TokenVault PDA's metadata, the will's associated token account, and the user's
 * own ATA (derived differently depending on whether the mint belonged to the
 * legacy Token program or Token-2022, which meant an extra `getAccountInfo` per
 * mint just to find out).
 *
 * Here there is one balance source per token: the contract's ledger for the
 * escrow, and `balanceOf` for the user. Both come back in one multicall.
 *
 * There is no "list every token this wallet holds" equivalent: EVM has no
 * `getParsedTokenAccountsByOwner`, because an ERC-20 balance is a mapping entry
 * inside the token contract rather than an account the chain can enumerate by
 * owner. Discovery of arbitrary holdings needs an indexer; the UI instead asks
 * for the token address, which is also how every EVM app does it.
 */
export function useTokenBalances(tokenVaults: TokenVaultView[]) {
  const client = usePublicClient();
  const { address: userWallet } = useAccount();
  const queryClient = useQueryClient();

  // Stable cache key: the vault set is identified by its token addresses, so a
  // re-rendered parent passing a fresh array does not refetch.
  const vaultKey = useMemo(
    () =>
      tokenVaults
        .map((v) => v.token.toLowerCase())
        .sort()
        .join(","),
    [tokenVaults]
  );

  const fetchVaultDisplays = useCallback(async (): Promise<TokenVaultDisplay[]> => {
    if (tokenVaults.length === 0 || !client) return [];

    return Promise.all(
      tokenVaults.map(async (v) => {
        const meta = await fetchTokenMeta(client, v.token);

        let userBalance = 0n;
        if (userWallet) {
          try {
            userBalance = await client.readContract({
              address: v.token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [userWallet],
            });
          } catch {
            // A non-conforming token; treat as zero rather than failing the page.
          }
        }

        return {
          token: v.token,
          symbol: meta.symbol,
          name: meta.name,
          decimals: meta.decimals,
          totalEscrowed: formatUnits(v.totalDeposited, meta.decimals),
          vaultBalance: formatUnits(v.remaining, meta.decimals),
          userBalance: formatUnits(userBalance, meta.decimals),
        };
      })
    );
  }, [tokenVaults, client, userWallet]);

  const vaultQuery = useQuery({
    queryKey: ["tokenVaultDisplays", vaultKey, userWallet ?? "anon"],
    queryFn: fetchVaultDisplays,
    enabled: !!client,
    staleTime: 15_000,
  });

  /** Look up one arbitrary token the user typed in. */
  const probeToken = useCallback(
    async (token: Address): Promise<UserTokenInfo | null> => {
      if (!client) return null;
      const meta = await fetchTokenMeta(client, token);
      if (!meta.trusted) return null; // not an ERC-20 we can price correctly
      let balance = 0n;
      if (userWallet) {
        balance = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userWallet],
        });
      }
      return {
        token,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        balance: formatUnits(balance, meta.decimals),
      };
    },
    [client, userWallet]
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tokenVaultDisplays"] });
  }, [queryClient]);

  return {
    vaultDisplays: vaultQuery.data ?? [],
    loading: vaultQuery.isLoading,
    error: vaultQuery.error instanceof Error ? vaultQuery.error.message : null,
    probeToken,
    refresh,
  };
}
