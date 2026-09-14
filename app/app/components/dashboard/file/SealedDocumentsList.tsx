"use client";

import { FC, useState } from "react";
import type { Address } from "viem";
import type { MediaView } from "@/lib/evm/types";
import type { TxActionResult } from "../shared/ui";
import { MediaPreview } from "./MediaPreview";
import { SealedDocumentRow } from "./SealedDocumentRow";
import { DocumentFilterBar } from "./DocumentFilterBar";
import { useSealedDocuments } from "@/hooks/useSealedDocuments";
import { RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface SealedDocumentsListProps {
  media: MediaView[];
  /** Scopes the IPFS metadata entitlement check to this will (lib/server/authz.ts). */
  owner: Address | null;
  isActive: boolean;
  onRemove: (index: number) => Promise<TxActionResult>;
  refresh: () => void;
}

export const SealedDocumentsList: FC<SealedDocumentsListProps> = ({
  media,
  owner,
  isActive,
  onRemove,
  refresh,
}) => {
  const [previewItem, setPreviewItem] = useState<{ cid: string; type: string } | null>(null);

  const {
    searchTerm,
    setSearchTerm,
    dateRange,
    setDateRange,
    sortOrder,
    setSortOrder,
    filteredMedia,
    hasFilters,
    clearFilters,
  } = useSealedDocuments(media, owner);

  const toggleSort = () => {
    if (sortOrder === "newest") {
      setSortOrder("oldest");
    } else if (sortOrder === "oldest") {
      setSortOrder("index");
    } else {
      setSortOrder("newest");
    }
  };

  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Your Sealed Documents ({filteredMedia.length})
        </h4>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[10px] text-accent hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className="size-3" /> Clear filters
          </button>
        )}
      </div>

      <DocumentFilterBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />

      {filteredMedia.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 rounded-xl border border-border bg-black/10">
          <p className="text-xs text-muted">
            {media.length === 0 ? "No documents sealed yet. Add items above." : "No documents match filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[350px] w-full border border-border bg-black/20 rounded-xl scrollbar-none">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-white/[0.01]">
                <th className="w-16 py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/60 hidden md:table-cell text-center">
                  Index
                </th>
                <th className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/60 min-w-[200px]">
                  Document
                </th>
                <th className="w-24 py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                  Size
                </th>
                <th
                  onClick={toggleSort}
                  className="w-32 py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/60 hover:text-foreground hidden sm:table-cell cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Sealed Date</span>
                    {sortOrder === "newest" ? (
                      <ArrowDown className="size-3 text-[var(--accent)]" />
                    ) : sortOrder === "oldest" ? (
                      <ArrowUp className="size-3 text-[var(--accent)]" />
                    ) : (
                      <ArrowUpDown className="size-3 opacity-30 hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="w-32 py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                  CID
                </th>
                <th className="w-24 py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/60 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMedia
                .map(({ mediaItem }) => (
                  <SealedDocumentRow
                    key={mediaItem.index}
                    mediaItem={mediaItem}
                    owner={owner}
                    isActive={isActive}
                    onRemove={onRemove}
                    onPreview={(cid, type) => setPreviewItem({ cid, type })}
                    refresh={refresh}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}

      {previewItem && (
        <MediaPreview
          cid={previewItem.cid}
          owner={owner}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
};
