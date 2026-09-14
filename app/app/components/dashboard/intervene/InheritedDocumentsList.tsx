"use client";

import { FC, useState } from "react";
import type { Address } from "viem";
import type { MediaView } from "@/lib/evm/types";
import { fixedHexToStr } from "@/lib/evm/codec";
import { MediaPreview } from "../file/MediaPreview";
import { PinataMetadataDisplay } from "../file/PinataMetadataDisplay";

interface InheritedDocumentsListProps {
  media: MediaView[];
  /** Will owner — scopes the IPFS metadata entitlement check. */
  owner: Address;
}

export const InheritedDocumentsList: FC<InheritedDocumentsListProps> = ({ media, owner }) => {
  const [previewItem, setPreviewItem] = useState<{ cid: string; type: string } | null>(null);

  if (media.length === 0) {
    return <p className="text-xs text-muted">No media records found on this will.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-black/10 p-4">
      <h4 className="text-xs font-semibold text-foreground mb-2.5 uppercase tracking-wider">
        Inherited documents & assets ({media.length})
      </h4>
      <ul className="flex flex-col gap-2.5">
        {media
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((m) => {
            const cid = m.cid;
            const type = fixedHexToStr(m.mediaType);
            return (
              <li
                key={m.index}
                className="flex flex-col gap-1 rounded-lg border border-border bg-black/20 px-3.5 py-2.5 text-xs transition-colors hover:bg-black/30"
              >
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-mono text-[11px] text-white/80 block">
                      CID: {cid}
                    </span>
                    <span className="text-[10px] text-muted font-mono block mt-0.5">
                      #{m.index} · On-chain Type: {type}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewItem({ cid, type })}
                      className="text-[11px] font-semibold text-accent hover:text-foreground transition-colors"
                    >
                      Preview Content
                    </button>
                    {/* No public-gateway link: documents are encrypted and
                        pinned privately, so a raw gateway URL would serve
                        nothing useful and would sidestep the access check.
                        Everything goes through the authorized viewer. */}
                  </div>
                </div>
                <PinataMetadataDisplay cid={cid} owner={owner} />
              </li>
            );
          })}
      </ul>

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
