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

/** Maximum length of the pin label. Long enough to be useful, short enough to bound. */
const MAX_LABEL = 128;

/**
 * Rename a pin. Owner-only.
 *
 * The label stored here is NOT the document's real filename — that lives
 * encrypted inside the sealed container (C5) and the server never sees it. This
 * is an operator-visible label only, which is why it is worth keeping
 * deliberately uninformative.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const limited = rateLimit(`update:${auth.wallet}`, WRITE_LIMIT);
    if (limited) return limited;

    const { cid, name, owner } = (await request.json()) ?? {};
    if (!isValidCid(cid)) return invalidCidResponse();
    if (!isValidAddress(owner)) return invalidAddressResponse();

    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Provide a non-empty name" },
        { status: 400 }
      );
    }
    if (name.length > MAX_LABEL) {
      return NextResponse.json(
        { error: `Name must be ${MAX_LABEL} characters or fewer` },
        { status: 400 }
      );
    }

    const decision = await authorizeCid(auth.wallet, owner, cid, "write");
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    }

    const pinata = getPinata();
    const fileId = await fileIdForCid(pinata, cid);
    if (!fileId) {
      return NextResponse.json(
        { error: "That document is not pinned" },
        { status: 404 }
      );
    }

    await pinata.files.private.update({ id: fileId, name: name.trim() });
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverError("ipfs/update", err);
  }
}
