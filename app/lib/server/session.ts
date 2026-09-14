/**
 * Wallet-signature sessions for the API layer.
 *
 * Before this existed, every `/api/ipfs/*` route acted on any caller's behalf
 * using the server's Pinata credentials: anyone could delete or rename another
 * user's inheritance documents with nothing but a CID scraped off the public
 * ledger.
 *
 * The flow is the standard sign-in-with-wallet handshake:
 *
 *   GET  /api/auth/challenge → server issues a signed, single-use nonce
 *   POST /api/auth/verify    → client returns the wallet's signature over that
 *                              challenge; server verifies it and sets an
 *                              HttpOnly session cookie
 *
 * Both the challenge and the session are stateless HMAC-signed tokens, so no
 * database is required and nothing breaks if the process restarts mid-handshake.
 * A small in-memory cache burns each nonce on use, which stops replay inside the
 * challenge's short lifetime.
 *
 * ## What changed in the EVM migration
 *
 * The signature scheme moved from **ed25519 over raw bytes** (`tweetnacl` +
 * `bs58`) to **EIP-191 `personal_sign`** (ECDSA over the prefixed message hash),
 * verified with viem's `verifyMessage`. Three consequences:
 *
 *  * `tweetnacl` and `bs58` are gone from the server entirely.
 *  * Addresses are `0x…` hex, and are compared **case-insensitively** — EIP-55
 *    checksumming means the same address has two valid spellings, and a
 *    case-sensitive comparison would reject a wallet that returns the other one.
 *  * `verifyMessage` also validates **ERC-1271** signatures, so a smart-contract
 *    wallet (Safe, or any ERC-4337 account — which Robinhood Chain documents
 *    support for) can sign in. The ed25519 path had no equivalent.
 *
 * NOTE: the burned-nonce cache is per-process. On a single instance that is
 * exact; behind multiple instances it degrades to "replayable within
 * CHALLENGE_TTL_MS", which is why that TTL is kept short. Moving to Redis is the
 * one change needed to scale this horizontally.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { verifyMessage, isAddress, getAddress, type Address } from "viem";
import { publicClient } from "@/lib/evm/publicClient";
import { CHAIN_ID } from "@/lib/evm/config";

export const SESSION_COOKIE = "vault_session";
const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes to sign
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * HMAC key for challenge and session tokens.
 *
 * Deliberately throws rather than falling back to a default: a predictable
 * signing key would let anyone mint a session for any wallet, which is strictly
 * worse than the server refusing to start.
 */
function secret(): Buffer {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET is not configured (needs >= 32 chars). Refusing to issue sessions."
    );
  }
  return Buffer.from(raw, "utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function verifySignature(payload: string, mac: string): boolean {
  const expected = Buffer.from(sign(payload), "utf8");
  const given = Buffer.from(mac, "utf8");
  // Length check first: timingSafeEqual throws on a length mismatch.
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Addresses are stored and compared lowercased.
 *
 * EIP-55 gives every address two valid spellings (checksummed and lowercase),
 * and different wallets return different ones. Normalising at every boundary is
 * what stops a session issued for `0xAbC…` from failing to match `0xabc…`.
 */
export function normalizeAddress(value: string): Address | null {
  if (!isAddress(value)) return null;
  return getAddress(value).toLowerCase() as Address;
}

// ---- challenge ---------------------------------------------------------

/** Nonces already redeemed, with the time they expire. */
const burned = new Map<string, number>();

function sweepBurned(now: number) {
  for (const [nonce, expiry] of burned) {
    if (expiry <= now) burned.delete(nonce);
  }
}

export interface Challenge {
  /** The exact text the wallet must sign. */
  message: string;
  /** Opaque token echoed back on verify; carries the nonce and its expiry. */
  token: string;
}

/**
 * The message the wallet signs.
 *
 * Human-readable on purpose — the user sees it in their wallet, and it says
 * plainly that signing authorizes no transaction. The chain id is included so a
 * signature harvested on one network cannot be replayed on another.
 */
function challengeMessage(
  wallet: string,
  nonce: string,
  expiresAt: number
): string {
  return [
    "Sign in to Vault Inheritance",
    "",
    `Wallet: ${wallet}`,
    `Chain: ${CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "This signature proves you control this wallet. It authorizes no",
    "transaction and moves no funds.",
  ].join("\n");
}

export function createChallenge(wallet: string): Challenge {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid address");

  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const payload = `${normalized}.${nonce}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;

  return { message: challengeMessage(normalized, nonce, expiresAt), token };
}

export interface VerifyResult {
  ok: boolean;
  wallet?: Address;
  error?: string;
}

/**
 * Verify a signed challenge and return the authenticated wallet.
 *
 * Checks, in order: token integrity, expiry, single use, that the message the
 * wallet signed is exactly the one this token describes, and finally the
 * signature itself against the claimed address.
 */
export async function verifyChallenge(
  token: string,
  wallet: string,
  message: string,
  signature: string
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, error: "Malformed challenge token" };
  const [tokenWallet, nonce, expiryRaw, mac] = parts;
  const payload = `${tokenWallet}.${nonce}.${expiryRaw}`;

  if (!verifySignature(payload, mac)) {
    return { ok: false, error: "Challenge token failed verification" };
  }

  const normalized = normalizeAddress(wallet);
  if (!normalized) return { ok: false, error: "Invalid address" };
  if (tokenWallet !== normalized) {
    return { ok: false, error: "Challenge was issued for a different wallet" };
  }

  const expiresAt = Number(expiryRaw);
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, error: "Challenge expired; request a new one" };
  }

  sweepBurned(now);
  if (burned.has(nonce)) return { ok: false, error: "Challenge already used" };

  // The signed text must be exactly what this token authorizes — otherwise a
  // signature harvested for one purpose could be presented for another.
  if (message !== challengeMessage(normalized, nonce, expiresAt)) {
    return { ok: false, error: "Signed message does not match the challenge" };
  }

  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    return { ok: false, error: "Signature is not valid hex" };
  }

  let verified = false;
  try {
    // Handles EOAs (EIP-191 ECDSA) and, via the public client, contract wallets
    // that implement ERC-1271.
    verified = await verifyMessage({
      address: getAddress(normalized),
      message,
      signature: signature as `0x${string}`,
      // @ts-expect-error viem accepts a client for ERC-1271 verification
      client: publicClient,
    });
  } catch {
    return { ok: false, error: "Signature could not be verified" };
  }
  if (!verified) return { ok: false, error: "Signature does not match wallet" };

  burned.set(nonce, expiresAt);
  return { ok: true, wallet: normalized };
}

// ---- session -----------------------------------------------------------

/** Mint the cookie value for an authenticated wallet. */
export function createSessionToken(wallet: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${wallet.toLowerCase()}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** Recover the wallet from a session cookie, or null if invalid/expired. */
export function readSessionToken(token: string | undefined): Address | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [wallet, expiryRaw, mac] = parts;
  if (!verifySignature(`${wallet}.${expiryRaw}`, mac)) return null;
  const expiresAt = Number(expiryRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return normalizeAddress(wallet);
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
