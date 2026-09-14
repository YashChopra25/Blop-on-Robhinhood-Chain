import { NextResponse } from "next/server";
import { currentWallet } from "@/lib/server/guard";
import { serverError } from "@/lib/server/guard";

export const runtime = "nodejs";

/** Who am I? Lets the client skip the handshake when a session is still valid. */
export async function GET() {
  try {
    const wallet = await currentWallet();
    return NextResponse.json(
      { wallet },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return serverError("auth/session", err);
  }
}
