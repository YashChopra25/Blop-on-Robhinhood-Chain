import { FC, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useVaultSession } from "@/hooks/useVaultSession";

interface EditDocumentNameModalProps {
  cid: string;
  /** Will owner — the update route only lets the owner rename. */
  owner: Address | null;
  fileName: string;
  onClose: () => void;
}

export const EditDocumentNameModal: FC<EditDocumentNameModalProps> = ({
  cid,
  owner,
  fileName,
  onClose,
}) => {
  const [newName, setNewName] = useState("");
  const [updating, setUpdating] = useState(false);
  const queryClient = useQueryClient();
  const { authFetch } = useVaultSession();

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setUpdating(true);
    const toastId = toast.loading("Updating file metadata name...");
    try {
      const res = await authFetch("/api/ipfs/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, owner, name: newName.trim() }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || "Update failed");
      toast.success("Document metadata updated successfully!", { id: toastId });
      queryClient.invalidateQueries({ queryKey: ["ipfs-metadata", owner, cid] });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast.error(msg, { id: toastId });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-left">
      <div className="max-w-md w-full rounded-2xl border border-border-strong bg-surface p-6 space-y-5 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-muted hover:text-foreground hover:bg-white/[0.04] rounded-lg transition-all"><X className="size-4" /></button>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Edit Document Name</h3>
          <p className="text-[10px] text-muted mt-0.5 font-mono">CID: {cid}</p>
        </div>
        <div className="rounded-xl border border-[var(--warn)]/20 bg-[var(--warn)]/5 p-4 text-[10px] text-muted leading-relaxed flex gap-2.5 items-start">
          <AlertTriangle className="size-4 text-[var(--warn)] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[var(--warn)] font-semibold uppercase block mb-0.5">Disclaimer</strong>
            Modifying this name updates metadata displayed on Pinata and Blop. The file content remains sealed, encrypted, and unchanged on the network.
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted font-medium">New document name</label>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full h-9 bg-black/40 border border-border rounded-lg px-3 text-xs text-foreground focus:outline-none focus:border-[var(--accent)]/50 transition-colors" placeholder={fileName} />
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-semibold hover:bg-white/5 text-foreground transition-colors cursor-pointer">Cancel</button>
          <button type="button" onClick={handleSaveName} disabled={updating || !newName.trim() || newName.trim() === fileName} className="h-9 px-4 rounded-lg text-xs font-semibold btn-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">{updating ? "Saving..." : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
};
