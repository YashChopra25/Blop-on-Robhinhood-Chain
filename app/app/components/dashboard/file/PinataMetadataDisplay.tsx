"use client";

import { FC } from "react";
import type { Address } from "viem";
import { usePinataMetadata } from "@/hooks/usePinataMetadata";

interface PinataMetadataDisplayProps {
  cid: string;
  /** Will owner — scopes the metadata entitlement check. */
  owner: Address | null;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export const PinataMetadataDisplay: FC<PinataMetadataDisplayProps> = ({ cid, owner }) => {
  const { data, isLoading, error } = usePinataMetadata(cid, owner);

  if (isLoading) {
    return (
      <div className="mt-2.5 p-3 rounded-xl border border-border bg-white/[0.01] glass-strong flex items-center justify-between gap-3 animate-pulse">
        <div className="flex flex-col gap-1.5 w-full">
          <div className="h-3 w-1/3 bg-white/10 rounded-full" />
          <div className="h-2.5 w-2/3 bg-white/5 rounded-full" />
        </div>
        <div className="size-4 rounded-full border border-border-strong border-t-accent animate-spin shrink-0" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-2.5 px-3 py-2 rounded-xl border border-border bg-white/[0.005] flex items-center gap-2 text-[10px] text-muted">
        <span className="inline-flex size-1.5 rounded-full bg-white/20" />
        <span>Metadata unavailable for this CID</span>
      </div>
    );
  }

  const { name, size, mimeType, createdAt } = data;
  const formattedSize = formatBytes(size);
  const formattedDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mt-2.5 p-3.5 rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.03] transition-all duration-300 shadow-md flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded bg-accent/10 border border-accent/25 text-accent shrink-0">
            <svg
              className="size-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-white/90 truncate hover:text-foreground transition-colors">
              {name || "Untitled File"}
            </div>
            <div className="text-[10px] text-muted mt-0.5 font-mono truncate">
              {mimeType}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[10px] font-semibold text-accent font-mono block">
            {formattedSize}
          </span>
          <span className="text-[9px] text-muted block mt-0.5 font-mono">
            {formattedDate}
          </span>
        </div>
      </div>
      {data.keyvalues && Object.keys(data.keyvalues).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1 pt-1.5 border-t border-border">
          {Object.entries(data.keyvalues).map(([k, v]) => (
            <span
              key={k}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-white/5 border border-border text-white/70"
            >
              {k}: {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
