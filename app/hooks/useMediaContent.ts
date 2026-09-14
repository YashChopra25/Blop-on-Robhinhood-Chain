"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { isSealed, unsealFile } from "@/lib/crypto";
import { useVaultIdentity, useVaultSession } from "./useVaultSession";

/**
 * Fetch a vault document and open it in the browser.
 *
 * The server hands back ciphertext and nothing else (C5), so the decryption
 * happens here, under a key derived from the viewer's own wallet. A viewer who
 * is not a recipient gets a clear "not sealed to you" message rather than a
 * blank frame — that is an expected outcome for an heir who has not been named,
 * not an error state.
 *
 * The real filename and MIME type come out of the sealed container, not from
 * the server or the chain, because both of those are public.
 */

interface MediaContent {
  objectUrl: string | null;
  textPreview: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

const EMPTY: MediaContent = {
  objectUrl: null,
  textPreview: null,
  fileName: null,
  mimeType: null,
  fileSize: null,
};

function isTextual(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("xml") ||
    mime.includes("markdown")
  );
}

export function useMediaContent(cid: string, owner: Address | null) {
  const { authFetch } = useVaultSession();
  const { unlock, wallet } = useVaultIdentity();
  // Object URLs are revoked when a new one replaces them, so the previous
  // blob is not leaked for the lifetime of the page.
  const [previousUrl, setPreviousUrl] = useState<string | null>(null);

  const load = useCallback(async (): Promise<MediaContent> => {
    if (!wallet) throw new Error("Connect a wallet to view this document");
    if (!owner) throw new Error("Unknown vault for this document");

    // The retrieve route is authenticated and authorizes against the chain;
    // `authFetch` asks for a signature if the session is missing or expired.
    const res = await authFetch(
      `/api/ipfs/retrieve?cid=${encodeURIComponent(cid)}&owner=${encodeURIComponent(owner)}`
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || `Could not load document (${res.status})`);
    }

    const container = new Uint8Array(await res.arrayBuffer());
    if (!isSealed(container)) {
      throw new Error(
        "This document predates encrypted storage and can no longer be opened. Re-upload it to seal it."
      );
    }

    const identity = await unlock();
    const { bytes, name, mime } = await unsealFile(container, identity, wallet);

    if (isTextual(mime)) {
      return {
        ...EMPTY,
        textPreview: new TextDecoder().decode(bytes),
        fileName: name,
        mimeType: mime,
        fileSize: bytes.byteLength,
      };
    }

    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: mime })
    );
    setPreviousUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return {
      ...EMPTY,
      objectUrl: url,
      fileName: name,
      mimeType: mime,
      fileSize: bytes.byteLength,
    };
  }, [cid, owner, wallet, unlock, authFetch]);

  const query = useQuery({
    queryKey: ["mediaContent", owner, cid, wallet],
    queryFn: load,
    enabled: !!cid && !!wallet && !!owner,
    // Ciphertext for a CID never changes, and decryption is not free.
    staleTime: 5 * 60_000,
    retry: false,
  });

  const content = query.data ?? EMPTY;

  const downloadFile = useCallback(() => {
    if (!content.objectUrl || !content.fileName) return;
    const a = document.createElement("a");
    a.href = content.objectUrl;
    a.download = content.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [content.objectUrl, content.fileName]);

  return {
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    objectUrl: content.objectUrl,
    textPreview: content.textPreview,
    /** Real filename, recovered from inside the sealed container. */
    fileName: content.fileName,
    /** Real MIME type, recovered from inside the sealed container. */
    mimeType: content.mimeType,
    fileSize: content.fileSize,
    downloadFile,
    // Kept for callers that render a "previous preview" placeholder.
    previousUrl,
  };
}
