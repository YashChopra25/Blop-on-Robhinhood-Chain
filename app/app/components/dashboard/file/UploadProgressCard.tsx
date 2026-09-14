"use client";

import { FC } from "react";

interface UploadProgressCardProps {
  progress: number;
}

export const UploadProgressCard: FC<UploadProgressCardProps> = ({ progress }) => {
  return (
    <div className="mt-2 p-3.5 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 flex flex-col gap-2.5 transition-all duration-300">
      <div className="flex items-start gap-3.5">
        <div className="size-4 rounded-full border-2 border-border-strong border-t-[var(--accent)] animate-spin mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Sealing document...</span>
            <span className="font-mono text-accent">{progress}%</span>
          </div>
          <p className="text-[10px] text-muted leading-normal mt-1">
            {progress < 45 
              ? "Uploading file to IPFS storage..." 
              : progress < 100 
              ? "Recording on Robinhood Chain. Please approve your wallet pop-up..." 
              : "Complete!"}
          </p>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5 mt-0.5">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--neon)] transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 animate-shimmer rounded-full" />
        </div>
      </div>
    </div>
  );
};
