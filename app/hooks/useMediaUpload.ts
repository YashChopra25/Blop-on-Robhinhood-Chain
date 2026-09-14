"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useVault } from "./useVault";
import { useVaultSession, useVaultIdentity } from "./useVaultSession";
import { sealFile, type Recipient } from "@/lib/crypto";
import { hexToKey } from "@/lib/evm/codec";
import type { BeneficiaryView } from "@/lib/evm/types";

interface UseMediaUploadProps {
  refresh: () => void;
  isActive: boolean;
  /**
   * Whether the will's custodian quorum is reachable (`custodian_count > 0` and
   * `min_approvals <= custodian_count`). `add_media_reference` calls
   * `require_quorum_reachable`, so without this the upload would fail with
   * `QuorumUnreachable` (6025) — but only at the very last step, after the file
   * has been encrypted and pinned to IPFS.
   */
  canUpload: boolean;
  /**
   * The will's heirs. Every one who has published an encryption key gets a
   * sealed copy of this document's data key — that is what lets them open it
   * after the owner is gone, without the server ever holding a key.
   */
  beneficiaries: BeneficiaryView[];
}

/** An heir named on the will who has not published an encryption key yet. */
export interface UnreachableHeir {
  wallet: string;
}

export function useMediaUpload({
  refresh,
  isActive,
  canUpload,
  beneficiaries,
}: UseMediaUploadProps) {
  const vault = useVault();
  const session = useVaultSession();
  const { unlock } = useVaultIdentity();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  /**
   * Heirs who cannot be sealed to yet. Surfaced so the owner finds out BEFORE
   * uploading rather than after they are gone: a document sealed without an
   * heir can never be shared with them retroactively.
   */
  const unreachableHeirs: UnreachableHeir[] = beneficiaries
    .filter((b) => !b.hasEncryptionKey)
    .map((b) => ({ wallet: b.wallet }));

  async function onUpload() {
    if (!selectedFile) {
      setError("Choose a file first");
      return;
    }
    // The program only accepts new media while the will is Active; catching it
    // here gives a readable message instead of a failed transaction.
    if (!isActive) {
      setError(
        "Documents can only be added while the will is active. It is currently in death confirmation."
      );
      return;
    }
    // Checked before any encryption or upload work: the on-chain guard runs in
    // the very last instruction, so failing it here saves the user from
    // encrypting and pinning a file that can never be recorded.
    if (!canUpload) {
      setError(
        "Add at least one custodian, and make sure the required approvals do not exceed the number of custodians, before sealing documents."
      );
      return;
    }

    setBusy(true);
    setError(null);
    setUploadProgress(0);
    const toastId = toast.loading("Preparing document…");

    try {
      // 1. Authenticate to our own API (C4). The upload route rejects anonymous
      //    callers, so do this before spending time on encryption. Checked
      //    against the server, since a cached "signed in" can outlive the cookie.
      toast.loading("Checking your session…", { id: toastId });
      await session.ensureSignedIn();

      // 2. Derive this wallet's document key and build the recipient set: the
      //    owner, plus every heir who has published a key.
      toast.loading("Unlocking your document key…", { id: toastId });
      const identity = await unlock();
      const ownerWallet = vault.address;
      if (!ownerWallet) throw new Error("Connect a wallet first");

      const recipients: Recipient[] = [
        { wallet: ownerWallet, encryptionPublicKey: identity.publicKey },
        ...beneficiaries
          .filter((b) => b.hasEncryptionKey)
          .map((b) => ({
            wallet: b.wallet,
            encryptionPublicKey: hexToKey(b.encryptionPubkey),
          })),
      ];

      // 3. Encrypt in the browser (C5). Nothing readable leaves this point.
      toast.loading(`Encrypting "${selectedFile.name}"…`, { id: toastId });
      setUploadProgress(10);
      const sealed = await sealFile(selectedFile, recipients);
      setUploadProgress(25);

      const sealedFile = new File(
        [sealed as BlobPart],
        `${selectedFile.name}.vseal`,
        { type: "application/octet-stream" }
      );

      // 4. Upload the ciphertext.
      const json = await new Promise<{ cid: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/ipfs/upload");
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = 25 + Math.round((event.loaded / event.total) * 30);
            setUploadProgress(percent);
            toast.loading(`Uploading encrypted document (${percent}%)…`, {
              id: toastId,
            });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid response from upload server"));
            }
          } else {
            try {
              const errJson = JSON.parse(xhr.responseText);
              reject(
                new Error(
                  errJson.error ?? `Upload failed with status ${xhr.status}`
                )
              );
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));

        const fd = new FormData();
        fd.append("file", sealedFile);
        xhr.send(fd);
      });

      // 5. Record the CID on-chain. The stored media type describes the
      //    CONTAINER, not the document — the real MIME type is encrypted inside
      //    it, so publishing it here would leak what the file is.
      setUploadProgress(60);
      toast.loading("Sign the transaction in your wallet…", { id: toastId });

      const interval = setInterval(() => {
        setUploadProgress((prev) => (prev < 90 ? prev + 5 : prev));
      }, 800);
      try {
        await vault.addMedia(json.cid, "application/vseal");
      } finally {
        clearInterval(interval);
      }

      setUploadProgress(100);
      toast.success(
        `"${selectedFile.name}" encrypted and sealed on-chain for ${
          recipients.length
        } ${recipients.length === 1 ? "recipient" : "recipients"}.`,
        { id: toastId }
      );
      setSelectedFile(null);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(msg, { id: toastId });
      setError(msg);
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  }

  return {
    selectedFile,
    setSelectedFile,
    busy,
    error,
    uploadProgress,
    unreachableHeirs,
    onUpload,
  };
}
