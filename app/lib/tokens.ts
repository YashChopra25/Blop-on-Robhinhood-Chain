import type { Address, PublicClient } from "viem";
import { erc20Abi } from "@/lib/evm/erc20";

/** Shared ERC-20 display metadata helpers. */

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * Fallback metadata for a token whose optional metadata calls fail.
 *
 * `name`, `symbol` and `decimals` are OPTIONAL in ERC-20. Several
 * widely-held tokens omit them or return `bytes32` instead of `string`, so every
 * read is best-effort and never allowed to fail an escrow.
 *
 * Note the deliberate absence of a hardcoded well-known-token table. The Solana
 * client shipped one (`COMMON_TOKENS`) because fetching SPL mint metadata meant
 * a separate Metaplex lookup. ERC-20 exposes `symbol()`/`decimals()` on the
 * token itself, so the chain is the source of truth and a stale baked-in address
 * cannot mislabel a balance.
 */
export function fallbackMeta(token: string): TokenMeta {
  return {
    symbol: `${token.slice(0, 6)}…`,
    name: "ERC-20 Token",
    decimals: 18,
  };
}

/**
 * Read a token's metadata from the chain.
 *
 * `decimals` matters for correctness (it scales every amount the user types),
 * so a failure there falls back to 18 — the overwhelmingly common value — and is
 * surfaced to the caller so the UI can warn.
 */
export async function fetchTokenMeta(
  client: PublicClient,
  token: Address
): Promise<TokenMeta & { trusted: boolean }> {
  const results = await client.multicall({
    contracts: [
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
    ],
    allowFailure: true,
  });

  const fb = fallbackMeta(token);
  const [symbolRes, nameRes, decimalsRes] = results;

  return {
    symbol: symbolRes.status === "success" ? (symbolRes.result as string) : fb.symbol,
    name: nameRes.status === "success" ? (nameRes.result as string) : fb.name,
    decimals:
      decimalsRes.status === "success" ? Number(decimalsRes.result) : fb.decimals,
    trusted: decimalsRes.status === "success",
  };
}

/**
 * Format a raw base-unit amount to a decimal UI string, trimming trailing zeros.
 *
 * Unchanged from the Solana client except that the input is now a native
 * `bigint` rather than a `BN` — one fewer wrapper, same precision guarantee.
 */
export function formatUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const neg = raw < BigInt(0);
  const abs = neg ? -raw : raw;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const out = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${out}` : out;
}

/** Parse a decimal UI string into raw base units. Throws on a malformed value. */
export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`"${value}" is not a valid amount`);
  }
  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(
      `This token has ${decimals} decimals; "${value}" has ${frac.length}`
    );
  }
  return BigInt(whole + frac.padEnd(decimals, "0"));
}
