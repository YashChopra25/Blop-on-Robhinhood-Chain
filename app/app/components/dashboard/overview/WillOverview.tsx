"use client";

import { willStatusLabel } from "@/lib/utils";
import { FC } from "react";
import { useVault } from "@/hooks/useVault";
import { short } from "../shared/ui";
import { CountdownTracker } from "./CountdownTracker";
import type { WillBundle } from "@/hooks/useWill";

interface WillOverviewProps {
  data: WillBundle;
}

/**
 * A Solidity enum decodes to a number, so this is a lookup — the Solana version
 * had to unwrap Anchor's `{ active: {} }` encoding with `Object.keys(...)[0]`.
 */
const statusOf = willStatusLabel;

const Stat: FC<{
  label: string;
  value: string;
  highlight?: "active" | "safe" | "warn" | "danger";
}> = ({ label, value, highlight }) => {
  let textCls = "text-foreground";
  if (highlight === "active" || highlight === "safe") textCls = "text-[var(--neon)]";
  else if (highlight === "warn") textCls = "text-[var(--warn)]";
  else if (highlight === "danger") textCls = "text-[var(--danger)]";

  return (
    <div className="rounded-lg border border-border bg-black/20 px-3.5 py-2.5 transition-all hover:bg-black/30">
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold capitalize ${textCls}`}>
        {value}
      </div>
    </div>
  );
};

export const WillOverview: FC<WillOverviewProps> = ({ data }) => {
  const vault = useVault();
  const will = data?.will ?? null;

  if (!will) return null;

  const status = statusOf(will.status);
  const isActive = status === "active";
  const totalPct = will.totalAllocatedBps / 100;

  return (
    <div className="flex flex-col gap-4">
      {!isActive && (
        <div className="rounded-xl border border-(--warn)/30 bg-(--warn)/10 p-4 text-xs text-warn leading-relaxed">
          <strong className="block font-semibold mb-1 uppercase tracking-wider">
            Will Locked — Status: {status}
          </strong>
          This will is no longer active. Custom additions, removals of media,
          beneficiaries, custodians, and updates to the configuration parameters
          are locked.
        </div>
      )}

      <div className="rounded-xl border border-border bg-white/2 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-foreground">
            My Will Overview
          </h2>
          <span className="text-xs font-mono text-muted">
            Owner: {short(data.owner)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat
            label="Status"
            value={status}
            highlight={isActive ? "active" : "danger"}
          />
          <Stat label="Documents / Media" value={`${will.mediaCount} sealed`} />
          <Stat label="Custodians" value={`${will.custodianCount} added`} />
          <Stat
            label="Allocated Estate"
            value={`${totalPct}%`}
            highlight={totalPct === 100 ? "safe" : "warn"}
          />
        </div>

        {isActive && (
          <CountdownTracker
            lastInactivity={Number(will.lastActiveAt)}
            threshold={Number(will.inactivityThreshold)}
            onCheckIn={() =>
              vault.updateWill(
                will.inactivityThreshold,
                will.minApprovals
              )
            }
          />
        )}
      </div>
    </div>
  );
};
