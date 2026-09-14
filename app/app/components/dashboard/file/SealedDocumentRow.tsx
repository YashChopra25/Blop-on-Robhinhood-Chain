"use client";

import { FC, useState } from "react";
import type { Address } from "viem";
import type { MediaView } from "@/lib/evm/types";
import { fixedHexToStr } from "@/lib/evm/codec";
import { usePinataMetadata } from "@/hooks/usePinataMetadata";
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  MoreVertical,
  Eye,
  Trash2,
  Edit2,
  Copy,
  Check,
  LucideIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import type { TxActionResult } from "../shared/ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EditDocumentNameModal } from "./EditDocumentNameModal";
import { DeleteDocumentModal } from "./DeleteDocumentModal";

interface SealedDocumentRowProps {
  mediaItem: MediaView;
  /** Will owner — scopes the IPFS metadata entitlement check. */
  owner: Address | null;
  isActive: boolean;
  onRemove: (index: number) => Promise<TxActionResult>;
  onPreview: (cid: string, type: string) => void;
  refresh: () => void;
}


const getFileIconConfig = (type: string): { Icon: LucideIcon; colorClass: string } => {
  const t = type.toLowerCase().trim();

  // Helper matching checks for extensions or mime prefixes
  const isImage = t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].some(ext => t === ext || t.endsWith(`/${ext}`) || t.endsWith(`.${ext}`));
  const isVideo = t.startsWith("video/") || ["mp4", "webm", "mkv", "avi", "mov", "wmv"].some(ext => t === ext || t.endsWith(`/${ext}`) || t.endsWith(`.${ext}`));
  const isAudio = t.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac", "aac"].some(ext => t === ext || t.endsWith(`/${ext}`) || t.endsWith(`.${ext}`));
  const isPdf = t === "application/pdf" || t === "pdf" || t.endsWith("/pdf") || t.endsWith(".pdf");
  const isSpreadsheet = t.includes("spreadsheet") || t.includes("excel") || t.includes("sheet") || t === "text/csv" || ["xlsx", "xls", "csv"].some(ext => t === ext || t.endsWith(`/${ext}`) || t.endsWith(`.${ext}`));
  const isArchive = t.includes("zip") || t.includes("tar") || t.includes("rar") || t.includes("compressed") || t.includes("archive") || ["zip", "tar", "gz", "rar", "7z"].some(ext => t === ext || t.endsWith(`/${ext}`) || t.endsWith(`.${ext}`));
  const isCode = t.includes("javascript") || t.includes("json") || t.includes("xml") || t.includes("markdown") || t.startsWith("text/html") || t.startsWith("text/css") || t.startsWith("text/x-") || ["html", "css", "js", "jsx", "ts", "tsx", "json", "xml", "md", "py", "go", "rs", "c", "cpp", "sh"].some(ext => t === ext || t.endsWith(`/${ext}`) || t.endsWith(`.${ext}`));

  if (isImage) {
    return {
      Icon: FileImage,
      colorClass: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    };
  }
  if (isVideo) {
    return {
      Icon: FileVideo,
      colorClass: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    };
  }
  if (isAudio) {
    return {
      Icon: FileAudio,
      colorClass: "bg-rose-500/10 border-rose-500/20 text-rose-400",
    };
  }
  if (isPdf) {
    return {
      Icon: FileText,
      colorClass: "bg-red-500/10 border-red-500/20 text-red-400",
    };
  }
  if (isSpreadsheet) {
    return {
      Icon: FileSpreadsheet,
      colorClass: "bg-teal-500/10 border-teal-500/20 text-teal-400",
    };
  }
  if (isArchive) {
    return {
      Icon: FileArchive,
      colorClass: "bg-orange-500/10 border-orange-500/20 text-orange-400",
    };
  }
  if (isCode) {
    return {
      Icon: FileCode,
      colorClass: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
    };
  }

  // Default fallback
  return {
    Icon: FileText,
    colorClass: "bg-accent/10 border-accent/20 text-accent",
  };
};

export const SealedDocumentRow: FC<SealedDocumentRowProps> = ({
  mediaItem,
  owner,
  isActive,
  onRemove,
  onPreview,
  refresh,
}) => {
  const cid = mediaItem.cid;
  const type = fixedHexToStr(mediaItem.mediaType);
  const { data, isLoading } = usePinataMetadata(cid, owner);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const copyCid = () => {
    navigator.clipboard.writeText(cid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileName = data?.name || "Untitled File";
  const formattedSize = data ? formatBytes(data.size) : "--";
  const formattedDate = data ? new Date(data.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "--";

  const { Icon: FileIcon, colorClass } = getFileIconConfig(type);

  return (
    <tr className="border-b border-border hover:bg-white/[0.01] transition-colors group">
      <td className="w-16 py-3 px-4 text-muted font-mono text-[11px] hidden md:table-cell text-center">
        #{mediaItem.index}
      </td>
      <td className="py-3 px-4 min-w-[200px]">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded border shrink-0 ${colorClass}`}>
            <FileIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            {isLoading ? <div className="h-3.5 w-28 bg-white/10 rounded animate-pulse" /> : <div className="text-xs font-semibold text-white/90 truncate max-w-[200px]" title={fileName}>{fileName}</div>}
            <span className="text-[10px] text-muted truncate block max-w-[200px] font-mono">{type || "Unknown"}</span>
          </div>
        </div>
      </td>
      <td className="w-24 py-3 px-4 font-mono text-[11px] text-white/80">{isLoading ? <div className="h-3 w-12 bg-white/10 rounded animate-pulse" /> : formattedSize}</td>
      <td className="w-32 py-3 px-4 font-mono text-[11px] text-white/80 hidden sm:table-cell">{isLoading ? <div className="h-3 w-20 bg-white/10 rounded animate-pulse" /> : formattedDate}</td>
      <td className="w-32 py-3 px-4 font-mono text-[11px] text-muted">
        <div className="flex items-center gap-1.5 group/cid">
          <span className="truncate max-w-[80px]">{cid}</span>
          <button onClick={copyCid} className="p-1 hover:bg-white/5 rounded text-muted hover:text-foreground transition-colors">
            {copied ? <Check className="size-3 text-[var(--neon)]" /> : <Copy className="size-3 opacity-0 group-hover/cid:opacity-100 transition-opacity" />}
          </button>
        </div>
      </td>
      <td className="w-24 py-3 px-4 text-right relative">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-lg border border-border bg-white/[0.02] hover:bg-white/[0.05] text-muted hover:text-foreground transition-colors cursor-pointer"><MoreVertical className="size-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border bg-surface p-1.5 flex flex-col gap-1 w-40 z-50">
            <DropdownMenuItem onClick={() => onPreview(cid, type)} className="flex items-center gap-2.5 w-full px-2.5 py-2 text-[11px] font-semibold text-white/80 hover:text-foreground hover:bg-white/[0.04] rounded-lg transition-colors cursor-pointer">
              <Eye className="size-3.5 text-[var(--accent)]" /> <span>Preview</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)} className="flex items-center gap-2.5 w-full px-2.5 py-2 text-[11px] font-semibold text-white/80 hover:text-foreground hover:bg-white/[0.04] rounded-lg transition-colors cursor-pointer">
              <Edit2 className="size-3.5 text-[var(--warn)]" /> <span>Edit Name</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuItem onClick={() => setDeleteOpen(true)} disabled={!isActive} className="flex items-center gap-2.5 w-full px-2.5 py-2 text-[11px] font-semibold text-[var(--danger)] hover:text-foreground hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer">
              <Trash2 className="size-3.5 text-[var(--danger)]" /> <span>Remove</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {editOpen && (
          <EditDocumentNameModal
            cid={cid}
            owner={owner}
            fileName={fileName}
            onClose={() => setEditOpen(false)}
          />
        )}

        {deleteOpen && (
          <DeleteDocumentModal
            cid={cid}
            owner={owner}
            mediaIndex={mediaItem.index}
            isActive={isActive}
            onRemove={onRemove}
            onClose={() => setDeleteOpen(false)}
            refresh={refresh}
          />
        )}
      </td>
    </tr>
  );
};