import { NextResponse } from "next/server";
import { authorizeCid } from "@/lib/server/authz";
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
 * Pinning metadata for one document.
 *
 * Note what is NOT here any more: the stored `name` and `mime_type` used to be
 * the real filename and type. Those are now encrypted inside the sealed
 * container (C5), so this endpoint reports only what the server legitimately
 * knows — when the ciphertext was pinned and how large it is.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireSession();

    if (!auth.ok) return auth.response;

    const limited = rateLimit(`metadata:${auth.wallet}`, READ_LIMIT);
    if (limited) return limited;

    const params = new URL(request.url).searchParams;
    const cid = params.get("cid");
    if (!isValidCid(cid)) return invalidCidResponse();
    // The will owner scopes the on-chain lookup. The client always knows it, and
    // supplying it turns the entitlement check into a single O(1) contract read
    // instead of the account scan the Solana version needed.
    const owner = params.get("owner");
    if (!isValidAddress(owner)) return invalidAddressResponse();

    const decision = await authorizeCid(auth.wallet, owner, cid, "read");

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    }

    const pinata = getPinata();

    const response = await pinata.files.private.list().cid(cid);
    const file = response?.files?.[0];
    if (!file) {
      return NextResponse.json(
        { error: "That document is not pinned" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        id: file.id,
        cid: file.cid,
        /** Size of the CIPHERTEXT, not the original file. */
        name: file.name,
        size: file.size,
        createdAt: file.created_at,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return serverError("ipfs/metadata", err);
  }
}
