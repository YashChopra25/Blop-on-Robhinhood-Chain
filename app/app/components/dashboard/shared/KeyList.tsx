"use client";

import { FC, useState } from "react";
import type { Address } from "viem";
import { Check, Copy } from "lucide-react";
import { TxButton, short, type TxActionResult } from "./ui";

export type BadgeStyle = "success" | "warn" | "danger" | "neutral" | "accent";

export interface KeyListBadge {
  label: string;
  style?: BadgeStyle;
  /** Shown on hover — say what the badge means, not just what it is. */
  title?: string;
}

export interface KeyListItem {
  key: string;
  wallet: Address;
  badges?: KeyListBadge[];
  /** A second line under the address, for anything a badge cannot carry. */
  detail?: string;
  /** Small colour swatch before the address (used by the allocation legend). */
  swatch?: string;
  /**
   * Why this row cannot be removed right now. When set, the remove button is
   * disabled and this becomes its tooltip — the contract would revert anyway.
   */
  removeBlockedReason?: string;
}

interface KeyListProps {
  items: KeyListItem[];
  onRemove: (wallet: Address) => Promise<TxActionResult>;
  refresh: () => void;
  empty: string;
  disabled?: boolean;
}

const BADGE_CLS: Record<BadgeStyle, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  danger: "bg-red-500/15 text-red-400 border-red-500/25",
  accent:
    "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/25",
  neutral: "bg-white/10 text-white/85 border-border-strong",
};

const CopyButton: FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title="Copy full address"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard is unavailable outside a secure context; the full address
          // is on the row's tooltip either way, so there is nothing to report.
        }
      }}
      className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3 text-[var(--neon)]" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
};

export const KeyList: FC<KeyListProps> = ({
  items,
  onRemove,
  refresh,
  empty,
  disabled,
}) => {
  if (items.length === 0) {
    return <p className="py-2 text-xs text-muted">{empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => {
        const blocked = it.removeBlockedReason;
        return (
          <li
            key={it.key}
            className="flex flex-col gap-2 rounded-lg border border-border bg-black/20 px-3.5 py-2.5 text-xs transition-colors hover:bg-black/30 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {it.swatch && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: it.swatch }}
                  />
                )}
                <span className="font-mono text-white/90" title={it.wallet}>
                  {short(it.wallet)}
                </span>
                <CopyButton value={it.wallet} />
                {it.badges?.map((b) => (
                  <span
                    key={b.label}
                    title={b.title}
                    className={`rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      BADGE_CLS[b.style ?? "neutral"]
                    }`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
              {it.detail && (
                <p className="text-[10px] leading-relaxed text-muted">
                  {it.detail}
                </p>
              )}
            </div>

            <TxButton
              tone="ghost"
              action={() => onRemove(it.wallet)}
              onDone={refresh}
              disabled={disabled || !!blocked}
              title={
                blocked ??
                (disabled
                  ? "Actions are only allowed when the will is active"
                  : "")
              }
            >
              Remove
            </TxButton>
          </li>
        );
      })}
    </ul>
  );
};
