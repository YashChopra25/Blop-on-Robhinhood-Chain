import { useMemo } from "react";
import { getAddress, isAddress, type Address } from "viem";

/**
 * Parse a user-supplied EVM address, or null if it is not one.
 *
 * Successor to `useParsedKey`, which wrapped `new PublicKey(...)` in a
 * try/catch because the constructor threw on bad base58. viem's `isAddress` is a
 * predicate, so the happy path no longer runs through an exception.
 *
 * The result is checksummed (EIP-55) so it renders canonically and matches what
 * a wallet or explorer will show — the Solana client had no equivalent concern,
 * since base58 has one spelling.
 */
export function useParsedAddress(value: string): Address | null {
  return useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed || !isAddress(trimmed)) return null;
    return getAddress(trimmed);
  }, [value]);
}
