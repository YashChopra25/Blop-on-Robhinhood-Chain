import { PinataSDK } from "pinata";

/**
 * Server-side Pinata client.
 *
 * The JWT never reaches the browser, and every caller of this module has already
 * passed `requireSession` + `authorizeCid`, so these credentials can only be
 * spent on behalf of a wallet that owns (or has inherited) the target document.
 */
export function getPinata(): PinataSDK {
  const jwt = process.env.PINATA_JWT_TOKEN?.trim();
  if (!jwt) {
    throw new Error("PINATA_JWT_TOKEN is not configured on the server");
  }
  return new PinataSDK({
    pinataJwt: jwt,
    pinataGateway: process.env.PINATA_GATEWAY?.trim() || undefined,
  });
}

/** Resolve a CID to its Pinata file id, or null when it is not pinned here. */
export async function fileIdForCid(
  pinata: PinataSDK,
  cid: string
): Promise<string | null> {
  const response = await pinata.files.private.list().cid(cid);
  const file = response?.files?.[0];
  return file?.id ?? null;
}
