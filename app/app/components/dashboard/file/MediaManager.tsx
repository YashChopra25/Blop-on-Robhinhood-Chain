"use client";

import { FC } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { UploadProgressCard } from "./UploadProgressCard";
import { SealedDocumentsList } from "./SealedDocumentsList";
import { FileDropzone } from "./FileDropzone";
import type { BeneficiaryView, MediaView } from "@/lib/evm/types";

interface MediaManagerProps {
  refresh: () => void;
  media: MediaView[];
  isActive: boolean;
  /**
   * Whether the will's custodian quorum is reachable. The program's
   * `require_quorum_reachable` guard rejects `add_media_reference` when it is
   * not, so the upload controls are withheld rather than shown and left to
   * fail. The sealed list stays visible either way — a will can lose its quorum
   * (a custodian removed) long after documents were added to it.
   */
  canUpload: boolean;
  /** Heirs to seal each uploaded document to (C5). */
  beneficiaries: BeneficiaryView[];
}

export const MediaManager: FC<MediaManagerProps> = ({
  refresh,
  media,
  isActive,
  canUpload,
  beneficiaries,
}) => {
  const vault = useVault();

  const {
    selectedFile,
    setSelectedFile,
    busy,
    error,
    uploadProgress,
    unreachableHeirs,
    onUpload,
  } = useMediaUpload({
    refresh,
    isActive,
    canUpload,
    beneficiaries,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Sealed Media & Documents
          </h3>
          <p className="text-xs text-white/60 mt-1">
            Upload credentials, legal papers, or digital assets. Files are
            encrypted in your browser before they leave it — only you and your
            heirs can ever open them.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.02] border border-border px-3 py-2 shrink-0">
          <span className="text-[10px] uppercase text-muted tracking-wider">Total Sealed</span>
          <span className="text-xs font-semibold text-[var(--accent)] font-mono">{media.length} Files</span>
        </div>
      </div>

      {canUpload && unreachableHeirs.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-300">
            {unreachableHeirs.length}{" "}
            {unreachableHeirs.length === 1 ? "heir has" : "heirs have"} not set
            up a document key yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            Anything you upload now can never be opened by{" "}
            {unreachableHeirs.length === 1 ? "them" : "them"}, because documents
            are sealed to each recipient at upload time and cannot be shared
            retroactively. Ask them to connect their wallet and register a key,
            then upload.
          </p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {unreachableHeirs.map((h) => (
              <li key={h.wallet} className="font-mono text-[11px] text-amber-200/70">
                {h.wallet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Target (On Top) */}
      {!canUpload ? (
        <div className="max-w-2xl mx-auto w-full rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-8 text-center">
          <div className="mx-auto mb-3 w-fit rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-300">
            <Lock className="size-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Uploads are locked until your will can reach quorum
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-white/65">
            The contract will not accept a document into a will whose custodians could
            never confirm your passing. Complete the setup steps above first.
          </p>
          <Link
            href="/dashboard/custodians"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-foreground transition hover:bg-[var(--accent)]/90"
          >
            Manage custodians
          </Link>
        </div>
      ) : (
      <div className="max-w-2xl mx-auto w-full space-y-4">
        <FileDropzone
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
          busy={busy}
          isActive={isActive}
        />

        {selectedFile && (
          <button
            type="button"
            onClick={onUpload}
            disabled={busy || !isActive}
            className="w-full inline-flex h-10 items-center justify-center rounded-xl text-xs font-semibold btn-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? (
              <>
                <span className="size-3.5 mr-2 rounded-full border-2 border-border-strong border-t-white animate-spin" />
                Sealing & Indexing…
              </>
            ) : (
              "Seal & Upload File"
            )}
          </button>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        {busy && <UploadProgressCard progress={uploadProgress} />}
      </div>
      )}

      {/* Sealed Files List (At the Bottom) */}
      <div className="min-w-0 pt-4 border-t border-border">
        <SealedDocumentsList
          media={media}
          owner={vault.address ?? null}
          isActive={isActive}
          onRemove={(index) => vault.removeMedia(index)}
          refresh={refresh}
        />
      </div>
    </div>
  );
};
