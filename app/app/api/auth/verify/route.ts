import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyChallenge,
} from "@/lib/server/session";
import { rateLimit, serverError, WRITE_LIMIT } from "@/lib/server/guard";

export const runtime = "nodejs";

/**
 * Step 2 of sign-in: verify the wallet's signature over the challenge and set
 * the session cookie.
 *
 * The cookie is HttpOnly (so no script can read it, including anything that
 * ever slips past the CSP), SameSite=Strict (so no cross-site request can spend
 * it) and Secure outside development.
 *
 * The signature is an EIP-191 `personal_sign` over the challenge text, verified
 * with viem. Smart-contract wallets are supported via ERC-1271, which the
 * previous ed25519 path could not express.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, wallet, message, signature } = body ?? {};

    if (
      typeof token !== "string" ||
      typeof wallet !== "string" ||
      typeof message !== "string" ||
      typeof signature !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing token, wallet, message or signature" },
        { status: 400 }
      );
    }

    const limited = rateLimit(`verify:${wallet.toLowerCase()}`, WRITE_LIMIT);
    if (limited) return limited;

    // `await`: EIP-191 verification can fall through to an on-chain ERC-1271
    // call for smart-contract wallets, which the ed25519 path never needed.
    const result = await verifyChallenge(token, wallet, message, signature);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const jar = await cookies();
    jar.set(SESSION_COOKIE, createSessionToken(result.wallet!), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return NextResponse.json(
      { wallet: result.wallet },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return serverError("auth/verify", err);
  }
}
