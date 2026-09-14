import { NextResponse } from "next/server";
import {
  authorizeCid,
  type CidAccess,
} from "@/lib/server/authz";
import {
  invalidCidResponse,
  isValidCid,
  rateLimit,
  READ_LIMIT,
  invalidAddressResponse,
  isValidAddress,
  requireSession,
  serverError,
} from "@/lib/server/guard";
import { getPinata } from "@/lib/server/pinata";

export const runtime = "nodejs";

/**
 * Stream a document back to an authorized caller.
 *
 * Three fixes live here:
 *   * C4 — the route used to serve any CID to anyone. It now requires a session
 *     and checks entitlement against the chain.
 *   * H2 — the response used to be `Content-Disposition: inline` with the
 *     gateway's own content type, which turned an uploaded HTML or SVG file into
 *     first-party script running next to a connected wallet. Everything is now
 *     served as an opaque attachment with `nosniff`.
 *   * The body is ciphertext regardless (C5); the browser unseals it.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const limited = rateLimit(`retrieve:${auth.wallet}`, READ_LIMIT);
    if (limited) return limited;

    const params = new URL(request.url).searchParams;
    const cid = params.get("cid");
    if (!isValidCid(cid)) return invalidCidResponse();
    // The will owner scopes the on-chain lookup. The client always knows it, and
    // supplying it turns the entitlement check into a single O(1) contract read
    // instead of the account scan the Solana version needed.
    const owner = params.get("owner");
    if (!isValidAddress(owner)) return invalidAddressResponse();

    const access: CidAccess = "read";
    const decision = await authorizeCid(auth.wallet, owner, cid, access);
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    }

    // Private pins are fetched through a signed, short-lived gateway URL rather
    // than by attaching the account JWT to a public gateway request.
    const pinata = getPinata();
    const url = await pinata.gateways.private.createAccessLink({
      cid,
      expires: 60,
    });

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[ipfs/retrieve] gateway status ${res.status} for ${cid}`);
      return NextResponse.json(
        { error: "Could not fetch that document from IPFS" },
        { status: 502 }
      );
    }

    const body = await res.arrayBuffer();
    return new Response(Buffer.from(body), {
      status: 200,
      headers: {
        // Opaque bytes: the real type is inside the sealed container.
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${cid}.vseal"`,
        "X-Content-Type-Options": "nosniff",
        // Ciphertext is immutable per CID, but it is per-user private, so keep
        // it out of shared caches.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return serverError("ipfs/retrieve", err);
  }
}
