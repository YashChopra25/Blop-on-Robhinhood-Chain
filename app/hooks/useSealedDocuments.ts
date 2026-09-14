import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import type { Address } from "viem";
import { fetchPinataMetadata } from "@/app/services/pinata.service";
import type { MediaView } from "@/lib/evm/types";
import { useVaultSession } from "./useVaultSession";

/**
 * The CID is now a plain `string` on-chain, so the `bytesToCid` decode the
 * Solana version needed on every read is gone — the contract stores the CID as
 * text rather than as a zero-padded `[u8; 64]`.
 */
type MediaItem = MediaView;

export type SortOrder = "index" | "newest" | "oldest";

export function useSealedDocuments(media: MediaItem[], owner: Address | null) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<SortOrder>("index");
  const { wallet, authFetch } = useVaultSession();

  const metadataQueries = useQueries({
    queries: media.map((m) => ({
      queryKey: ["ipfs-metadata", owner, m.cid],
      // The API now scopes the entitlement check to a will, so the owner travels
      // with the CID. See lib/server/authz.ts.
      queryFn: () => fetchPinataMetadata(m.cid, owner!, authFetch),
      staleTime: 1000 * 60 * 10,
      enabled: !!owner && !!wallet && m.cid.length > 0,
      // A retry after a rejected signature would reopen the wallet prompt.
      retry: false,
    })),
  });

  const filteredMedia = useMemo(() => {
    const mapped = media
      .map((m, idx) => ({
        mediaItem: m,
        metadata: metadataQueries[idx]?.data || null,
      }))
      .filter(({ mediaItem, metadata }) => {
        const fileName = metadata?.name?.toLowerCase() || "";
        const cidStr = mediaItem.cid.toLowerCase();
        const matchesSearch =
          fileName.includes(searchTerm.toLowerCase()) ||
          cidStr.includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;
        if (!metadata) {
          return !dateRange?.from && !dateRange?.to;
        }

        const createdTime = new Date(metadata.createdAt).getTime();
        if (dateRange?.from && createdTime < dateRange.from.getTime()) return false;
        if (dateRange?.to && createdTime > dateRange.to.getTime() + 86400000) return false;

        return true;
      });

    if (sortOrder === "newest") {
      mapped.sort((a, b) => {
        const timeA = a.metadata ? new Date(a.metadata.createdAt).getTime() : 0;
        const timeB = b.metadata ? new Date(b.metadata.createdAt).getTime() : 0;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
        return b.mediaItem.index - a.mediaItem.index;
      });
    } else if (sortOrder === "oldest") {
      mapped.sort((a, b) => {
        const timeA = a.metadata ? new Date(a.metadata.createdAt).getTime() : 0;
        const timeB = b.metadata ? new Date(b.metadata.createdAt).getTime() : 0;

        if (timeA === 0) return 1;
        if (timeB === 0) return -1;

        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return a.mediaItem.index - b.mediaItem.index;
      });
    } else {
      mapped.sort((a, b) => a.mediaItem.index - b.mediaItem.index);
    }

    return mapped;
  }, [media, metadataQueries, searchTerm, dateRange, sortOrder]);

  const hasFilters = !!(searchTerm || dateRange?.from || dateRange?.to || sortOrder !== "index");

  const clearFilters = () => {
    setSearchTerm("");
    setDateRange(undefined);
    setSortOrder("index");
  };

  return {
    searchTerm,
    setSearchTerm,
    dateRange,
    setDateRange,
    sortOrder,
    setSortOrder,
    filteredMedia,
    hasFilters,
    clearFilters,
  };
}
