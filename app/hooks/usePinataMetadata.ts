import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchPinataMetadata } from "@/app/services/pinata.service";
import { PinataFileMetadata } from "@/app/types/pinata.types";
import { useVaultSession } from "./useVaultSession";

/**
 * IPFS metadata for one sealed document.
 *
 * `owner` is required because the metadata endpoint checks that the caller is
 * entitled to this will's documents before answering (see lib/server/authz.ts) —
 * a CID alone no longer identifies who may read it.
 */
export function usePinataMetadata(cid: string, owner: Address | null) {
  const { wallet, authFetch } = useVaultSession();
  return useQuery<PinataFileMetadata>({
    queryKey: ["ipfs-metadata", owner, cid],
    queryFn: () => fetchPinataMetadata(cid, owner!, authFetch),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
    // CIDv0 is 46 chars, CIDv1 ~59; just require a non-empty CID.
    enabled: cid.length > 0 && !!owner && !!wallet,
    // A retry after a rejected signature would reopen the wallet prompt.
    retry: false,
  });
}
