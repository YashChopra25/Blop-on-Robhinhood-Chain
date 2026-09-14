"use client";

import { FC, useRef, useState, DragEvent, ChangeEvent } from "react";
import { UploadCloud, File, X, AlertCircle } from "lucide-react";

interface FileDropzoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  busy: boolean;
  isActive: boolean;
}

export const FileDropzone: FC<FileDropzoneProps> = ({
  onFileSelect,
  selectedFile,
  busy,
  isActive,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (!isActive || busy) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    if (!isActive || busy) return;
    inputRef.current?.click();
  };

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={onButtonClick}
      className={`relative rounded-2xl border border-dashed p-8 transition-all duration-300 text-center flex flex-col items-center justify-center cursor-pointer group ${
        !isActive
          ? "border-border bg-black/5 opacity-55 cursor-not-allowed"
          : isDragActive
            ? "border-[var(--accent)] bg-[var(--accent)]/[0.04] shadow-lg shadow-[var(--accent)]/5"
            : selectedFile
              ? "border-[var(--neon)]/40 bg-[var(--neon)]/[0.01]"
              : "border-border bg-black/20 hover:border-[var(--accent)]/40 hover:bg-white/[0.01]"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        onChange={handleChange}
        disabled={busy || !isActive}
        className="hidden"
      />

      {selectedFile ? (
        <div className="space-y-3.5 w-full max-w-xs relative z-10 flex flex-col items-center">
          <div className="p-3 rounded-xl bg-[var(--neon)]/10 border border-[var(--neon)]/20 text-[var(--neon)] animate-pulse">
            <File className="size-6" />
          </div>
          <div className="min-w-0 text-center">
            {/* //showing the name of the file atmost 30 characters and if it exceeds then showing ... at the end */}
            <p className="text-xs font-semibold text-foreground truncate max-w-full ">
              {selectedFile.name.length > 30
                ? `${selectedFile.name.slice(0, 27)}...`
                : selectedFile.name}
            </p>
            <p className="text-[10px] text-muted font-mono mt-0.5">
              {formatBytes(selectedFile.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFileSelect(null);
            }}
            className="flex items-center gap-1 text-[10px] text-[var(--danger)] hover:text-foreground bg-[var(--danger)]/10 border border-[var(--danger)]/20 hover:bg-[var(--danger)]/20 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
          >
            <X className="size-3" /> Clear File
          </button>
        </div>
      ) : (
        <div className="space-y-4 relative z-10 flex flex-col items-center">
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-border text-muted group-hover:text-foreground group-hover:scale-105 group-hover:border-[var(--accent)]/20 group-hover:bg-[var(--accent)]/5 transition-all duration-300">
            <UploadCloud className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              Drag & drop document here, or{" "}
              <span className="text-[var(--accent)] group-hover:underline">
                browse
              </span>
            </p>
            <p className="text-[10px] text-muted max-w-[240px] leading-relaxed mx-auto">
              Securely sealed on-chain & pinned to decentralized IPFS storage.
            </p>
          </div>
        </div>
      )}

      {!isActive && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center p-4">
          <div className="flex items-center gap-2 rounded-xl bg-[#1a0f16]/90 border border-[var(--danger)]/20 px-3.5 py-2 text-xs text-[var(--danger)] font-medium">
            <AlertCircle className="size-4 shrink-0" />
            <span>Actions locked. Will is inactive.</span>
          </div>
        </div>
      )}
    </div>
  );
};
