import type { Address } from "viem";
import type { AuthFetch } from "@/hooks/useVaultSession";
import { PinataFileMetadata } from "../types/pinata.types";

/**
 * The will owner travels with the CID now.
 *
 * The API resolves entitlement with a single O(1) contract read
 * (`mediaIndexOfCid(owner, cid)`), replacing the Solana version's
 * `getProgramAccounts` scan with a memcmp over zero-padded CID bytes. The client
 * always knows which will it is browsing, so supplying the owner costs nothing
 * and removes the need for a global CID index the contract would otherwise have
 * to maintain on every upload.
 *
 * The route requires a session, so callers pass `authFetch`, which prompts for a
 * wallet signature when the session is missing or expired.
 */
export async function fetchPinataMetadata(
  cid: string,
  owner: Address,
  authFetch: AuthFetch
): Promise<PinataFileMetadata> {
  const res = await authFetch(
    `/api/ipfs/metadata?cid=${encodeURIComponent(cid)}&owner=${encodeURIComponent(owner)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load metadata");
  }
  return res.json();
}
