"use client";

import { FC } from "react";
import Link from "next/link";
import { ChevronRight, Coins, FileText, KeyRound } from "lucide-react";
import { short } from "../shared/ui";
import { formatRelativeDuration } from "@/lib/utils";
import { INHERITANCE_ROOT, PHASE_META } from "./inheritance.constants";
import type { InheritanceSummary } from "@/app/types/inheritance.types";

interface InheritanceCardProps {
  item: InheritanceSummary;
}

const Pill: FC<{ className: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <span
    className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${className}`}
  >
    {children}
  </span>
);

export const InheritanceCard: FC<InheritanceCardProps> = ({ item }) => {
  const { will, note, timeline, needsKey } = item;
  const meta = PHASE_META[timeline.phase];
  const Icon = meta.icon;
  const owner = will.owner;

  const actionable =
    (timeline.canClaimNow && !will.hasClaimed) || needsKey;

  return (
    <Link
      href={`${INHERITANCE_ROOT}/${owner}`}
      className={`group flex items-center gap-4 rounded-xl border p-4 transition-colors ${
        actionable
          ? "border-[var(--accent)]/25 bg-[var(--accent)]/[0.03] hover:border-[var(--accent)]/40"
          : "border-border bg-black/20 hover:border-border-strong hover:bg-black/30"
      }`}
    >
      <Icon className={`size-4 shrink-0 ${meta.iconCls}`} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-white/85" title={owner}>
            {short(will.owner)}
          </span>
          <Pill className={meta.pillCls}>{meta.label}</Pill>
          {will.hasClaimed && (
            <Pill className="border-[var(--neon)]/30 bg-[var(--neon)]/10 text-neon">
              Claimed
            </Pill>
          )}
          {timeline.closingSoon && !will.hasClaimed && (
            <Pill className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              {formatRelativeDuration(timeline.secondsUntilClose * 1000)} left
            </Pill>
          )}
          {needsKey && (
            <Pill className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              <KeyRound className="mr-0.5 inline size-2.5" />
              Key needed
            </Pill>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted">{note}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
          {will.allocationBps !== undefined && (
            <span className="text-white/70">
              Share: {will.allocationBps / 100}%
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3" />
            {will.mediaCount} sealed {will.mediaCount === 1 ? "file" : "files"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins className="size-3" />
            {will.tokenVaultCount} token{" "}
            {will.tokenVaultCount === 1 ? "vault" : "vaults"}
          </span>
          {timeline.phase === "pending" && (
            <span>
              {will.approvalsReceived}/{will.minApprovals} approvals
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
};
