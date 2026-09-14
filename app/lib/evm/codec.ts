import { hexToString, stringToHex, type Hex } from "viem";
import { CID_BYTE_LEN, MEDIA_TYPE_BYTE_LEN } from "./config";

/**
 * Fixed-width byte helpers for the contract's `bytes16` / `bytes32` fields.
 *
 * Successor to the `strToFixedBytes` / `fixedBytesToStr` pair in the Solana
 * client's `lib/anchor.ts`, which encoded Anchor's `[u8; N]` arrays. The shapes
 * are the same — zero-padded, fixed width — so the encoding rules carry over
 * unchanged; only the representation moves from `number[]` to a `0x…` hex
 * string.
 *
 * Note what is NOT here any more: the whole PDA-derivation block
 * (`willPda`, `custodianPda`, `beneficiaryPda`, `mediaPda`, `tokenVaultPda`,
 * `tokenClaimPda`, `getAta`, `resolveTokenProgram`). On EVM the owner's address
 * IS the key, so there is nothing to derive and nothing that can be derived
 * wrongly — the u16-little-endian bug class that `mediaPda` carried a comment
 * about simply cannot exist here.
 */

/**
 * Encode a UTF-8 string into a fixed-width hex value, zero-padded on the right.
 *
 * Throws on overflow rather than truncating, unless truncation is asked for
 * explicitly — the same guard the Solana client restored after an oversize value
 * silently produced the wrong shape.
 */
export function strToFixedHex(
  value: string,
  byteLen: number,
  { truncate = false }: { truncate?: boolean } = {}
): Hex {
  let bytes = new TextEncoder().encode(value);
  if (bytes.length > byteLen) {
    if (!truncate) {
      throw new Error(
        `Value "${value}" encodes to ${bytes.length} bytes; the on-chain field holds ${byteLen}`
      );
    }
    // Truncate on a UTF-8 boundary so we never store half a code point.
    let end = byteLen;
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
    bytes = bytes.subarray(0, end);
  }
  return stringToHex(new TextDecoder().decode(bytes), { size: byteLen });
}

/** Decode a fixed-width hex value back to a string, trimming zero padding. */
export function fixedHexToStr(hex: Hex): string {
  try {
    return hexToString(hex).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

/**
 * MIME types are advisory metadata, so an unusually long one is truncated rather
 * than blocking an upload the user cannot otherwise complete.
 */
export function mediaTypeToHex(mime: string): Hex {
  return strToFixedHex(mime, MEDIA_TYPE_BYTE_LEN, { truncate: true });
}

export function hexToMediaType(hex: Hex): string {
  return fixedHexToStr(hex);
}

/**
 * The contract stores a CID as a `string` with a 1..=64 byte length check — the
 * same ceiling as the Solana program's `[u8; 64]`. Validate client-side so the
 * user sees a readable message instead of a reverted simulation.
 */
export function assertValidCid(cid: string): string {
  const len = new TextEncoder().encode(cid).length;
  if (len === 0 || len > CID_BYTE_LEN) {
    throw new Error(`CID must be 1..=${CID_BYTE_LEN} bytes, got ${len}: ${cid}`);
  }
  return cid;
}

/**
 * X25519 public key ⇄ `bytes32`.
 *
 * The key is exactly 32 bytes, so `bytes32` is an exact fit for the Solana
 * `[u8; 32]`. All-zero remains the "unregistered" sentinel, as on-chain.
 */
export function keyToHex(key: Uint8Array): Hex {
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);
  }
  return `0x${Array.from(key, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export function hexToKey(hex: Hex): Uint8Array {
  const clean = hex.slice(2);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function hasEncryptionKey(hex: Hex | undefined): boolean {
  return !!hex && hex !== ZERO_BYTES32;
}

/** Shorten an address for display: 0x1234…abcd. */
export function short(value: string | undefined | null): string {
  if (!value) return "";
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

/**
 * Case-insensitive address comparison.
 *
 * Replaces `PublicKey.equals()`. Necessary rather than cosmetic: EIP-55 gives
 * every address two valid spellings, and the contract returns the checksummed
 * form while a wallet connector may report either. A bare `===` silently reports
 * "you are not a beneficiary of this will" for an heir who is.
 */
export function sameAddress(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
