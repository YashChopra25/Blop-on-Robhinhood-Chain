"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { vaultInheritanceAbi } from "@/lib/evm/abi";
import { CONTRACT_ADDRESS } from "@/lib/evm/config";
import { fetchTokenMeta, formatUnits } from "@/lib/tokens";
import type { InheritedTokenDisplay } from "@/app/types/inheritance.types";
import type { TokenVaultView } from "@/lib/evm/types";

/**
 * What an heir can see and claim on one will's escrowed tokens.
 *
 * Three reads collapse into one multicall per token: the vault's ledger comes
 * with the bundle, the heir's outstanding entitlement from `claimableAmount`,
 * and the record of an earlier claim from `getClaim`.
 *
 * The Solana version had to derive a `tokenClaimPda` per (vault, heir), fetch it
 * with `fetchNullable` to discover whether a claim existed, read the vault ATA's
 * balance separately, and recompute the heir's share in TypeScript from
 * `total_amount * allocation_bps / 10_000`.
 *
 * `claimableAmount` now performs that calculation on-chain — including the
 * `min(share, remaining)` clamp and every timing gate — so the figure the UI
 * shows is exactly what `claimToken` would pay out, and the two can never drift.
 */
export function useInheritedTokens(
  owner: Address | null,
  tokenVaults: TokenVaultView[]
) {
  const client = usePublicClient();
  const { address: me } = useAccount();

  const fetchTokens = useCallback(async (): Promise<InheritedTokenDisplay[]> => {
    if (!client || !owner || !me || tokenVaults.length === 0) return [];

    const contract = { address: CONTRACT_ADDRESS, abi: vaultInheritanceAbi } as const;

    const results = await client.multicall({
      contracts: tokenVaults.flatMap((v) => [
        { ...contract, functionName: "claimableAmount" as const, args: [owner, v.token, me] as const },
        { ...contract, functionName: "getClaim" as const, args: [owner, v.token, me] as const },
      ]),
      allowFailure: true,
    });

    return Promise.all(
      tokenVaults.map(async (v, i) => {
        const meta = await fetchTokenMeta(client, v.token);
        const claimableRes = results[i * 2];
        const claimRes = results[i * 2 + 1];

        const claimable =
          claimableRes.status === "success" ? (claimableRes.result as bigint) : 0n;
        const claim =
          claimRes.status === "success"
            ? (claimRes.result as unknown as { claimed: boolean; amount: bigint })
            : { claimed: false, amount: 0n };

        return {
          token: v.token,
          symbol: meta.symbol,
          name: meta.name,
          decimals: meta.decimals,
          totalEscrowed: formatUnits(v.totalDeposited, meta.decimals),
          vaultBalance: formatUnits(v.remaining, meta.decimals),
          // Zero while the grace period is still running, which is exactly when
          // the contract would reject the claim too.
          myShare: formatUnits(claimable, meta.decimals),
          claimed: claim.claimed,
          claimedAmount: formatUnits(claim.amount, meta.decimals),
        };
      })
    );
  }, [client, owner, me, tokenVaults]);

  const key = tokenVaults
    .map((v) => v.token.toLowerCase())
    .sort()
    .join(",");

  const query = useQuery({
    queryKey: ["inheritedTokens", owner, me, key],
    queryFn: fetchTokens,
    enabled: !!client && !!owner && !!me,
    staleTime: 15_000,
  });

  return {
    tokens: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}
