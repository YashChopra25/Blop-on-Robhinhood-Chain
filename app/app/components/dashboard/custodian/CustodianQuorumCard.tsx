"use client";

import { FC } from "react";
import Link from "next/link";
import { SlidersHorizontal, TriangleAlert } from "lucide-react";

interface CustodianQuorumCardProps {
  /** `min_approvals` on the will — how many custodians must confirm. */
  minApprovals: number;
  /** How many custodians are actually named. */
  custodianCount: number;
  /** How many have confirmed so far, in the current approval epoch. */
  approvalsReceived: number;
}

/**
 * Compact enough to sit in one half of a two-column row, so the custodian list
 * stays above the fold. Everything here is one number and its consequence.
 */
export const CustodianQuorumCard: FC<CustodianQuorumCardProps> = ({
  minApprovals,
  custodianCount,
  approvalsReceived,
}) => {
  // The program refuses to raise `min_approvals` above `custodian_count`, but a
  // will created before its custodians were added can still sit in this state —
  // and it can never reach quorum until more are named.
  const shortfall = minApprovals - custodianCount;
  const progress =
    minApprovals > 0 ? Math.min(approvalsReceived / minApprovals, 1) : 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.04] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wider text-muted">
          Confirmation requirement
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-white/80 transition hover:border-border-strong hover:bg-white/5 hover:text-foreground"
        >
          <SlidersHorizontal className="size-3 shrink-0" />
          Modify
        </Link>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <span className="text-4xl font-bold leading-none text-accent tabular-nums">
          {minApprovals}
        </span>
        <span className="pb-1 text-sm text-muted">
          of {custodianCount}{" "}
          {custodianCount === 1 ? "custodian" : "custodians"}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        {minApprovals} confirmation{minApprovals === 1 ? "" : "s"} required
        before your will can be claimed.
      </p>

      {approvalsReceived > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-amber-300">
              {approvalsReceived} of {minApprovals} confirmed
            </span>
            <span className="text-muted">
              {Math.max(minApprovals - approvalsReceived, 0)} to go
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--warn)] to-[var(--danger)] transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {shortfall > 0 && (
        <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-relaxed text-amber-200/85">
            <span className="font-semibold text-amber-300">
              Quorum cannot be reached.
            </span>{" "}
            Add {shortfall} more{" "}
            {shortfall === 1 ? "custodian" : "custodians"}, or lower the quorum
            in Will Settings.
          </p>
        </div>
      )}
    </div>
  );
};
