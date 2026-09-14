/**
 * Shared request guard for the IPFS routes: session, rate limit, upload limits
 * and error shaping (fixes C4, H3, M11).
 *
 * Every route funnels through `requireSession` and `rateLimit` before it touches
 * Pinata, so the pinning credentials can only ever be spent on behalf of a
 * wallet that proved control of itself, within a bounded budget.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "./session";
import { isAddress } from "viem";

// ---- session -----------------------------------------------------------

/** The authenticated wallet, or null when the caller has no valid session. */
export async function currentWallet(): Promise<string | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Resolve the caller's wallet or produce a 401.
 *
 * Returns a discriminated union so route handlers stay linear:
 * `const auth = await requireSession(); if (!auth.ok) return auth.response;`
 */
export async function requireSession(): Promise<
  { ok: true; wallet: string } | { ok: false; response: NextResponse }
> {
  const wallet = await currentWallet();
  if (!wallet) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sign in with your wallet to continue" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, wallet };
}

// ---- rate limiting -----------------------------------------------------

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimit {
  /** Sustained requests per minute. */
  perMinute: number;
  /** Burst capacity. */
  burst: number;
}

/** Read-ish endpoints: generous, but not unbounded. */
export const READ_LIMIT: RateLimit = { perMinute: 60, burst: 20 };
/** Mutating endpoints, including uploads: deliberately tight. */
export const WRITE_LIMIT: RateLimit = { perMinute: 12, burst: 5 };

/**
 * Token-bucket limiter keyed by wallet and route.
 *
 * Per-process, like the burned-nonce cache — exact on the current single-instance
 * deployment, approximate behind a fleet. Swap the Map for Redis to scale out;
 * the call sites do not change.
 */
export function rateLimit(
  key: string,
  limit: RateLimit = WRITE_LIMIT
): NextResponse | null {
  const now = Date.now();
  const refillPerMs = limit.perMinute / 60_000;

  const bucket = buckets.get(key) ?? { tokens: limit.burst, updatedAt: now };
  bucket.tokens = Math.min(
    limit.burst,
    bucket.tokens + (now - bucket.updatedAt) * refillPerMs
  );
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const retryAfter = Math.ceil((1 - bucket.tokens) / refillPerMs / 1000);
    return NextResponse.json(
      { error: "Too many requests. Slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);

  // Opportunistic sweep so idle wallets do not accumulate forever.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) {
      if (now - b.updatedAt > 10 * 60_000) buckets.delete(k);
    }
  }
  return null;
}

// ---- upload limits -----------------------------------------------------

/**
 * Hard ceiling on a single upload (H3).
 *
 * Applies to the *sealed* container, which is the plaintext plus AES-GCM tags
 * and the sealed-key header — a few hundred bytes of overhead.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Per-wallet budget per rolling hour, so an authenticated user still cannot run
 * up an unbounded pinning bill.
 */
export const MAX_UPLOAD_BYTES_PER_HOUR = 200 * 1024 * 1024; // 200 MB

interface Quota {
  used: number;
  windowStart: number;
}
const quotas = new Map<string, Quota>();

export function checkUploadQuota(
  wallet: string,
  size: number
): NextResponse | null {
  if (size <= 0) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large. The limit is ${
          MAX_UPLOAD_BYTES / (1024 * 1024)
        } MB.`,
      },
      { status: 413 }
    );
  }

  const now = Date.now();
  const quota = quotas.get(wallet) ?? { used: 0, windowStart: now };
  if (now - quota.windowStart > 60 * 60_000) {
    quota.used = 0;
    quota.windowStart = now;
  }
  if (quota.used + size > MAX_UPLOAD_BYTES_PER_HOUR) {
    quotas.set(wallet, quota);
    return NextResponse.json(
      {
        error:
          "Hourly upload limit reached for this wallet. Try again in an hour.",
      },
      { status: 429 }
    );
  }
  quota.used += size;
  quotas.set(wallet, quota);
  return null;
}

// ---- CID validation (M11: CIDv0 and CIDv1) -----------------------------

/**
 * Accept both CID versions the on-chain `[u8; 64]` field can hold:
 * CIDv0 (46-char base58 `Qm...`) and CIDv1 (base32 `b...`, typically 59 chars).
 *
 * The previous `length !== 46` check rejected every CIDv1, even though the
 * account field had already been widened to accept them.
 */
const CIDV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CIDV1 = /^b[a-z2-7]{20,62}$/;

export function isValidCid(cid: unknown): cid is string {
  return typeof cid === "string" && (CIDV0.test(cid) || CIDV1.test(cid));
}

export function invalidCidResponse(): NextResponse {
  return NextResponse.json(
    { error: "Invalid CID. Expected a CIDv0 (Qm…) or CIDv1 (b…) identifier." },
    { status: 400 }
  );
}

// ---- error shaping (M12) ----------------------------------------------

/**
 * Log the real error, return a generic one.
 *
 * Upstream messages from Pinata leak infrastructure detail and account state to
 * anyone who can trigger a 500, so they stay in the server log.
 */
export function serverError(scope: string, err: unknown): NextResponse {
  console.error(`[${scope}]`, err);
  return NextResponse.json(
    { error: "Something went wrong handling that request." },
    { status: 500 }
  );
}


// ---- address validation (EVM) ------------------------------------------

/**
 * Validate a will-owner address supplied by the client.
 *
 * New in the EVM migration: `authorizeCid` now takes the owner alongside the
 * CID, because the contract answers "does this will reference this CID?" in O(1)
 * given the owner — replacing the Solana version's `getProgramAccounts` scan
 * with a memcmp over zero-padded CID bytes. A wrong or malformed owner simply
 * fails the check, but rejecting it here gives a clearer error.
 */
export function isValidAddress(value: unknown): value is string {
  return typeof value === "string" && isAddress(value);
}

export function invalidAddressResponse(): NextResponse {
  return NextResponse.json(
    { error: "Invalid vault owner address." },
    { status: 400 }
  );
}
