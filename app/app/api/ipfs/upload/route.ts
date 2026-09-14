import { NextResponse } from "next/server";
import {
  checkUploadQuota,
  rateLimit,
  requireSession,
  serverError,
  WRITE_LIMIT,
} from "@/lib/server/guard";
import { getPinata } from "@/lib/server/pinata";

// This route is the IPFS backend: the browser POSTs an ALREADY-ENCRYPTED
// container here (see `lib/crypto.ts`), we pin it via Pinata — server-side, so
// the JWT never reaches the client — and return the CID, which the frontend
// then writes on-chain.
//
// Two things changed from the original implementation:
//   * it requires a wallet session, a rate limit and a size/quota budget (C4,
//     H3). It used to accept unlimited uploads from anyone on the internet,
//     billed to this account.
//   * it pins PRIVATELY and stores ciphertext. Public pinning combined with a
//     world-readable on-chain CID meant every "sealed" document was in fact
//     public (C5).

export const runtime = "nodejs";

/** Sealed containers always start with this magic — see `lib/crypto.ts`. */
const SEAL_MAGIC = "VSEAL1";

export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const limited = rateLimit(`upload:${auth.wallet}`, WRITE_LIMIT);
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided under the 'file' field" },
        { status: 400 }
      );
    }

    const overQuota = checkUploadQuota(auth.wallet, file.size);
    if (overQuota) return overQuota;

    // Refuse anything that is not a sealed container. Without this check a
    // client bug (or a tampered build) could silently publish plaintext, and the
    // CID would be on-chain before anyone noticed.
    const head = new TextDecoder().decode(
      new Uint8Array(await file.slice(0, SEAL_MAGIC.length).arrayBuffer())
    );
    if (head !== SEAL_MAGIC) {
      return NextResponse.json(
        {
          error:
            "Refusing to pin an unencrypted file. Documents must be sealed in the browser first.",
        },
        { status: 400 }
      );
    }

    const pinata = getPinata();
    const result = await pinata.upload.private.file(file);
    const cid = result.cid;

    if (!cid) {
      return NextResponse.json(
        { error: "Pinning service did not return a CID" },
        { status: 502 }
      );
    }

    // Size and MIME describe the CIPHERTEXT only; the real filename and type are
    // encrypted inside the container and never touch the server.
    return NextResponse.json(
      { cid, size: file.size },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return serverError("ipfs/upload", err);
  }
}
