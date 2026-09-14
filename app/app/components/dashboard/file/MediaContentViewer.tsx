"use client";

import { FC } from "react";

interface MediaContentViewerProps {
  cid: string;
  mediaType: string;
  objectUrl: string | null;
  textPreview: string | null;
  downloadFile: () => void;
}

export const MediaContentViewer: FC<MediaContentViewerProps> = ({
  cid,
  mediaType,
  objectUrl,
  textPreview,
  downloadFile,
}) => {
  const isImage = mediaType.startsWith("image/");
  const isVideo = mediaType.startsWith("video/");
  const isAudio = mediaType.startsWith("audio/");
  const isPdf = mediaType === "application/pdf";

  if (isImage && objectUrl) {
    return (
      <div className="relative group max-h-[50vh] overflow-hidden rounded-lg border border-border bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element --
            `objectUrl` is a blob: URL for a document that was decrypted in this
            browser. next/image optimizes remote URLs through the server, which
            is exactly what must never happen to a decrypted vault document. */}
        <img
          src={objectUrl}
          alt={`Preview of ${cid}`}
          className="object-contain max-h-[50vh] w-auto h-auto transition-transform hover:scale-105 duration-300"
        />
      </div>
    );
  }

  if (isVideo && objectUrl) {
    return (
      <video
        controls
        autoPlay
        src={objectUrl}
        className="max-h-[50vh] w-full rounded-lg border border-border bg-black"
      />
    );
  }

  if (isAudio && objectUrl) {
    return (
      <div className="w-full max-w-md rounded-xl bg-black/30 border border-border p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted uppercase font-mono">Audio Message</div>
            <div className="text-sm font-medium text-foreground truncate">{cid}</div>
          </div>
        </div>
        <audio src={objectUrl} controls className="w-full mt-2" />
      </div>
    );
  }

  if (isPdf && objectUrl) {
    // Mobile Safari and Chrome on Android refuse to render a PDF inside a frame
    // at all, so the frame is always paired with a way out to a real tab.
    return (
      <div className="w-full flex flex-col gap-3">
        <iframe
          src={objectUrl}
          className="w-full h-[50vh] rounded-lg border border-border bg-white/90"
          title="PDF Document Preview"
        />
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>Not showing? Open it in a new tab.</span>
          <div className="flex gap-2">
            <button
              onClick={() => window.open(objectUrl, "_blank", "noopener,noreferrer")}
              className="inline-flex h-8 items-center justify-center rounded-lg px-3 font-medium btn-ghost cursor-pointer"
            >
              Open in new tab
            </button>
            <button
              onClick={downloadFile}
              className="inline-flex h-8 items-center justify-center rounded-lg px-3 font-medium btn-primary cursor-pointer"
            >
              Download
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (textPreview !== null) {
    return (
      <div className="w-full max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-black/40 p-4">
        <pre className="text-[11px] font-mono text-white/95 whitespace-pre-wrap leading-relaxed">
          {textPreview}
        </pre>
      </div>
    );
  }

  return (
    <div className="text-center p-6 bg-black/20 border border-border rounded-xl max-w-sm">
      <div className="mx-auto size-12 rounded-full bg-white/5 flex items-center justify-center text-muted">
        <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h4 className="mt-3 text-sm font-medium text-foreground">No preview available</h4>
      <p className="mt-1 text-xs text-muted">
        This file type ({mediaType || "unknown"}) cannot be rendered in the browser.
      </p>
      <button
        onClick={downloadFile}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg px-4 text-xs font-medium btn-primary cursor-pointer"
      >
        Download File
      </button>
    </div>
  );
};
