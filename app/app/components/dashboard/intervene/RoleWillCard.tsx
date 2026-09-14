"use client";

import { FC } from "react";
import { short } from "../shared/ui";
import type { RoleWill } from "@/app/types/roles.types";

interface RoleWillCardProps {
  will: RoleWill;
  selected: boolean;
  onSelect: (owner: string) => void;
}

const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  claimable: "bg-red-500/10 border-red-500/30 text-red-400",
};

export const RoleWillCard: FC<RoleWillCardProps> = ({
  will,
  selected,
  onSelect,
}) => {
  const statusCls =
    STATUS_CLS[will.status] ?? "bg-white/10 border-border-strong text-white/85";

  return (
    <button
      type="button"
      onClick={() => onSelect(will.owner)}
      className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition ${
        selected
          ? "border-(--accent)/40 bg-(--accent)/5"
          : "border-border bg-black/20 hover:border-border-strong"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-white/85" title={will.owner}>
          {short(will.owner)}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${statusCls}`}
        >
          {will.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-muted">
        {will.allocationBps !== undefined && (
          <span>Share: {will.allocationBps / 100}%</span>
        )}
        {will.hasClaimed !== undefined && (
          <span>{will.hasClaimed ? "✓ Claimed" : "Unclaimed"}</span>
        )}
        {will.hasApproved !== undefined && (
          <span>{will.hasApproved ? "✓ Confirmed passing" : "Not confirmed"}</span>
        )}
      </div>
    </button>
  );
};
