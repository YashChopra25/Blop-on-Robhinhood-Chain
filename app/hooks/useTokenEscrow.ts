"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress, getAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { fetchTokenMeta, parseUnits, formatUnits } from "@/lib/tokens";
import { erc20Abi } from "@/lib/evm/erc20";
import { humanizeError } from "@/lib/evm/tx";
import type { WriteResult } from "./useVault";

/**
 * The "escrow a token" form.
 *
 * The Solana version probed a mint with `getParsedAccountInfo` and checked
 * `parsed.type === "mint"`, because SPL mints are chain-owned accounts with a
 * known shape. ERC-20 has no such marker: a token is anything that answers
 * `decimals()` and `balanceOf()`. So the probe here reads those, and refuses to
 * proceed if `decimals()` does not answer — without it every amount the user
 * types would be scaled wrongly.
 */
export interface MintProbe {
  token: string;
  decimals: number | null;
  symbol: string | null;
  balance: string | null;
  valid: boolean;
  error: string | null;
}

export function useTokenEscrow(
  depositToken: (token: Address, amount: bigint) => Promise<WriteResult>,
  refresh: () => void,
  account: Address | undefined
) {
  const client = usePublicClient();
  const [tokenAddress, setTokenAddress] = useState("");
  const [amount, setAmount] = useState("");

  /**
   * Result of the last completed probe, tagged with the address it was for.
   * Tagging lets the reset-on-change be DERIVED during render instead of written
   * from an effect: a stale result is simply ignored.
   */
  const [probeState, setProbeState] = useState<MintProbe | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only a probe for the address currently in the box counts.
  const probe = probeState?.token === tokenAddress ? probeState : null;
  const decimals = probe?.decimals ?? null;
  const symbol = probe?.symbol ?? null;
  const balance = probe?.balance ?? null;
  const isValidToken = probe?.valid ?? false;
  const error = submitError ?? probe?.error ?? null;

  useEffect(() => {
    if (!tokenAddress || !client) return;

    let active = true;
    const record = (next: Omit<MintProbe, "token">) => {
      if (active) setProbeState({ token: tokenAddress, ...next });
    };

    const check = async () => {
      try {
        if (!isAddress(tokenAddress)) {
          throw new Error("That is not a valid EVM address (expected 0x…)");
        }
        const token = getAddress(tokenAddress);
        const meta = await fetchTokenMeta(client, token);
        if (!meta.trusted) {
          throw new Error(
            "That address does not answer decimals(), so it is not a usable ERC-20."
          );
        }
        let raw = 0n;
        if (account) {
          raw = await client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          });
        }
        record({
          decimals: meta.decimals,
          symbol: meta.symbol,
          balance: formatUnits(raw, meta.decimals),
          valid: true,
          error: null,
        });
      } catch (e) {
        record({
          decimals: null,
          symbol: null,
          balance: null,
          valid: false,
          error: e instanceof Error ? e.message : "Invalid token address",
        });
      } finally {
        if (active) setChecking(false);
      }
    };

    // Flip the spinner on a microtask so the effect body itself stays free of
    // state writes, then run the lookup.
    void Promise.resolve().then(() => {
      if (active) setChecking(true);
      return check();
    });

    return () => {
      active = false;
    };
  }, [tokenAddress, client, account]);

  const submitEscrow = useCallback(async () => {
    if (!isValidToken || !tokenAddress || !amount || decimals === null) {
      setSubmitError("Please fill out all fields correctly");
      return;
    }
    setSubmitError(null);
    setSuccessHash(null);
    setSubmitting(true);
    try {
      const raw = parseUnits(amount, decimals);
      if (raw <= 0n) throw new Error("Amount must be greater than zero");
      if (balance !== null && parseUnits(balance, decimals) < raw) {
        throw new Error(`Insufficient balance. You have ${balance} ${symbol ?? ""}`);
      }

      // `depositToken` sets the ERC-20 allowance first if it is short — the step
      // SPL did not need, because there the owner signed the transfer itself
      // inside the same instruction.
      const result = await depositToken(getAddress(tokenAddress), raw);
      setSuccessHash(result.hash);
      setTokenAddress("");
      setAmount("");
      refresh();
    } catch (e) {
      setSubmitError(humanizeError(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    tokenAddress,
    amount,
    decimals,
    balance,
    symbol,
    isValidToken,
    depositToken,
    refresh,
  ]);

  return {
    tokenAddress,
    setTokenAddress,
    amount,
    setAmount,
    symbol,
    decimals,
    balance,
    isValidToken,
    checking,
    error,
    successHash,
    submitting,
    submitEscrow,
  };
}

export function useTokenEscrowRemove(
  withdrawToken: (token: Address) => Promise<WriteResult>,
  refresh: () => void
) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);

  const submitRemove = useCallback(
    async (token: string) => {
      setError(null);
      setSuccessHash(null);
      setRemoving(true);
      try {
        if (!isAddress(token)) throw new Error("Invalid token address");
        const result = await withdrawToken(getAddress(token));
        setSuccessHash(result.hash);
        refresh();
      } catch (e) {
        setError(humanizeError(e));
      } finally {
        setRemoving(false);
      }
    },
    [withdrawToken, refresh]
  );

  return { removing, error, successHash, submitRemove };
}
