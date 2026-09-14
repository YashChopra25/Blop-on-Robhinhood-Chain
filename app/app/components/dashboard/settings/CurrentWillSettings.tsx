"use client";

import { FC, type ReactNode } from "react";
import Link from "next/link";
import { short } from "../shared/ui";
import type { WillBundle } from "@/hooks/useWill";

interface CurrentWillSettingsProps {
  data: WillBundle;
  status: string;
}

const SECS_PER_DAY = 86_400;

/** `86400` → `"1 day"`, `129600` → `"1.5 days"`, `3600` → `"1 hour"`. */
export function humanizeThreshold(secs: number): string {
  if (secs <= 0) return "not set";
  if (secs % SECS_PER_DAY === 0) {
    const days = secs / SECS_PER_DAY;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (secs >= SECS_PER_DAY) {
    return `${(secs / SECS_PER_DAY).toFixed(2).replace(/\.?0+$/, "")} days`;
  }
  if (secs % 3600 === 0) {
    const hours = secs / 3600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const mins = Math.round(secs / 60);
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

/** Unix seconds → local date-time, or a dash for the zero sentinel. */
function whenOf(unixSecs: number): string {
  if (!unixSecs) return "—";
  return new Date(unixSecs * 1000).toLocaleString();
}

const Row: FC<{ label: string; children: ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-black/20 px-3.5 py-2.5">
    <span className="text-[10px] uppercase tracking-wider text-muted">
      {label}
    </span>
    <span className="text-sm font-semibold text-foreground">{children}</span>
    {hint && <span className="text-[11px] text-muted">{hint}</span>}
  </div>
);

/**
 * Everything currently stored on the will, read-only.
 *
 * The update form below it only accepts two of these values, so this is where
 * the owner confirms what the rest of their configuration actually is without
 * having to walk every tab.
 */
export const CurrentWillSettings: FC<CurrentWillSettingsProps> = ({
  data,
  status,
}) => {
  const will = data.will;
  if (!will) return null;

  const thresholdSecs = Number(will.inactivityThreshold);
  const allocatedPct = will.totalAllocatedBps / 100;
  // The program's own quorum rule, mirrored so this panel never disagrees with
  // what a transaction would do.
  const quorumReachable =
    will.custodianCount > 0 && will.minApprovals <= will.custodianCount;

  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Current will settings
          </h4>
          <p className="mt-0.5 text-xs text-muted">
            What is stored on-chain right now.
          </p>
        </div>
        <span
          className="font-mono text-xs text-muted"
          title={data.owner}
        >
          Owner: {short(data.owner)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Status">
          <span
            className={`capitalize ${
              status === "active" ? "text-[var(--neon)]" : "text-[var(--warn)]"
            }`}
          >
            {status}
          </span>
        </Row>

        <Row
          label="Inactivity threshold"
          hint={`${thresholdSecs.toLocaleString()} seconds`}
        >
          {humanizeThreshold(thresholdSecs)}
        </Row>

        <Row
          label="Required approvals"
          hint={
            quorumReachable
              ? undefined
              : "Quorum unreachable — assets cannot be added"
          }
        >
          <span className={quorumReachable ? "" : "text-amber-300"}>
            {will.minApprovals} of {will.custodianCount}{" "}
            {will.custodianCount === 1 ? "custodian" : "custodians"}
          </span>
        </Row>

        <Row
          label="Custodians"
          hint={
            will.approvalsReceived > 0
              ? `${will.approvalsReceived} confirmed passing`
              : undefined
          }
        >
          <Link
            href="/dashboard/custodians"
            className="hover:text-[var(--accent)]"
          >
            {will.custodianCount} named
          </Link>
        </Row>

        <Row
          label="Beneficiaries"
          hint={`${allocatedPct}% of the estate allocated`}
        >
          <Link
            href="/dashboard/beneficiaries"
            className="hover:text-[var(--accent)]"
          >
            {will.beneficiaryCount} named
          </Link>
        </Row>

        <Row label="Sealed documents">
          <Link href="/dashboard/files" className="hover:text-[var(--accent)]">
            {will.mediaCount} sealed
          </Link>
        </Row>

        <Row label="Escrowed tokens">
          <Link href="/dashboard/assets" className="hover:text-[var(--accent)]">
            {will.tokenVaultCount}{" "}
            {will.tokenVaultCount === 1 ? "vault" : "vaults"}
          </Link>
        </Row>

        <Row label="Created">{whenOf(Number(will.createdAt))}</Row>

        <Row
          label="Last activity"
          hint="Refreshed every time you update the will"
        >
          {whenOf(Number(will.lastActiveAt))}
        </Row>

        {will.claimableAt > 0n && (
          <Row label="Became claimable">
            {whenOf(Number(will.claimableAt))}
          </Row>
        )}
      </div>
    </div>
  );
};
