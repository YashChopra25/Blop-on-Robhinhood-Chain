"use client";

import { FC } from "react";
import type { Address } from "viem";
import { useMediaContent } from "@/hooks/useMediaContent";
import { MediaContentViewer } from "./MediaContentViewer";

interface MediaPreviewProps {
  cid: string;
  /** Will owner — scopes the retrieve entitlement check. */
  owner: Address | null;
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export const MediaPreview: FC<MediaPreviewProps> = ({ cid, owner, onClose }) => {
  // Name, type and size all come out of the sealed container after decryption —
  // the on-chain media type is deliberately just "application/vseal", because
  // publishing the real type would leak what the document is (C5).
  const {
    loading,
    error,
    objectUrl,
    textPreview,
    fileName,
    mimeType,
    fileSize,
    downloadFile,
  } = useMediaContent(cid, owner);
  const mediaType = mimeType ?? "application/octet-stream";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border-strong bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-black/20">
          <div>
            <h3 className="text-md font-semibold text-foreground truncate max-w-md">
              {fileName ?? "Sealed document"}
            </h3>
            <p className="mt-0.5 text-xs text-muted font-mono truncate max-w-lg">
              CID: {cid}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-white/15 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close preview"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Viewport */}
        <div className="p-6 flex flex-col items-center justify-center min-h-[250px] max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <div className="size-8 animate-spin rounded-full border-2 border-border-strong border-t-accent shrink-0" />
              <p className="text-xs text-muted animate-pulse">
                Fetching and decrypting…
              </p>
            </div>
          )}

          {error && (
            <div className="text-center p-4 max-w-md">
              <svg className="mx-auto size-12 text-red-500/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h4 className="mt-3 text-sm font-medium text-foreground">Cannot open this document</h4>
              <p className="mt-1 text-xs text-muted">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <div className="w-full flex items-center justify-center">
              <MediaContentViewer
                cid={cid}
                mediaType={mediaType}
                objectUrl={objectUrl}
                textPreview={textPreview}
                downloadFile={downloadFile}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-4 bg-black/20 text-xs">
          <div className="text-muted">
            Type: <span className="font-mono text-foreground">{mediaType}</span>
            {fileSize && (
              <>
                {" · "}
                Size: <span className="font-mono text-foreground">{formatBytes(fileSize)}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {objectUrl && (
              <button
                onClick={downloadFile}
                className="inline-flex h-9 items-center justify-center rounded-lg px-4 font-medium btn-ghost cursor-pointer"
              >
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-lg px-4 font-medium bg-white/10 hover:bg-white/15 text-foreground transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
