import { NextResponse } from "next/server";
import { authorizeCid } from "@/lib/server/authz";
import {
  invalidCidResponse,
  isValidCid,
  rateLimit,
  invalidAddressResponse,
  isValidAddress,
  requireSession,
  serverError,
  WRITE_LIMIT,
} from "@/lib/server/guard";
import { fileIdForCid, getPinata } from "@/lib/server/pinata";

export const runtime = "nodejs";

/**
 * Unpin a document. Owner-only.
 *
 * This route was the sharpest edge of C4: it accepted a bare CID from anyone and
 * deleted the corresponding file. Since every CID is published on-chain, that
 * made every user's inheritance documents destroyable by any passer-by.
 *
 * The client-supplied `fileId` shortcut is also gone — accepting it let a caller
 * name a file the CID check never covered. The id is now always resolved from
 * the authorized CID, server-side.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const limited = rateLimit(`delete:${auth.wallet}`, WRITE_LIMIT);
    if (limited) return limited;

    const { cid, owner } = (await request.json()) ?? {};
    if (!isValidCid(cid)) return invalidCidResponse();
    if (!isValidAddress(owner)) return invalidAddressResponse();

    const decision = await authorizeCid(auth.wallet, owner, cid, "write");
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    }

    const pinata = getPinata();
    const fileId = await fileIdForCid(pinata, cid);
    if (!fileId) {
      // Already gone: report success so a retried teardown is idempotent.
      return NextResponse.json({ success: true, alreadyRemoved: true });
    }

    await pinata.files.private.delete([fileId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverError("ipfs/delete", err);
  }
}
