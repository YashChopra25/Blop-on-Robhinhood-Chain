"use client";

import { FC } from "react";
import type { Address } from "viem";
import { short } from "../shared/ui";
import { PHASE_META } from "./inheritance.constants";
import type { ClaimTimeline } from "@/app/types/inheritance.types";
import type { WillView } from "@/lib/evm/types";

interface InheritanceStatusCardProps {
  owner: Address;
  will: WillView;
  timeline: ClaimTimeline;
  /** This heir's slice of the escrowed tokens, in basis points. */
  allocationBps: number;
}

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-border bg-black/20 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-muted">
      {label}
    </div>
    <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
  </div>
);

export const InheritanceStatusCard: FC<InheritanceStatusCardProps> = ({
  owner,
  will,
  timeline,
  allocationBps,
}) => {
  const meta = PHASE_META[timeline.phase];
  const Icon = meta.icon;
  const approvalProgress =
    will.minApprovals > 0
      ? Math.min(will.approvalsReceived / will.minApprovals, 1)
      : 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Will of {short(owner)}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.pillCls}`}
        >
          <Icon className="size-3" />
          {meta.label}
        </span>
      </div>

      <p className="font-mono text-[10px] break-all text-muted">
        {owner}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Your share" value={`${allocationBps / 100}%`} />
        <Stat label="Sealed media" value={`${will.mediaCount}`} />
        <Stat label="Token vaults" value={`${will.tokenVaultCount}`} />
        <Stat label="Co-heirs" value={`${Math.max(will.beneficiaryCount - 1, 0)}`} />
      </div>

      {/* Only meaningful before quorum: once it is reached the tally is frozen
          and the timeline below takes over as the thing to watch. */}
      {(timeline.phase === "active" || timeline.phase === "pending") && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>Custodian approvals</span>
            <span className="font-mono text-white/80">
              {will.approvalsReceived} / {will.minApprovals}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--warn)] to-[var(--danger)] transition-all duration-500"
              style={{ width: `${approvalProgress * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
