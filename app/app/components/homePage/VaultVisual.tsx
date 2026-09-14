"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { DotField } from "@/app/components/fx/DotField";
import { ScrambleText } from "@/app/components/fx/ScrambleText";
import { paintVaultWheel } from "@/app/components/fx/artwork";

interface VaultVisualProps {
  ownerKey?: Address | null;
  status?: string;
  mediaCount?: number;
  beneficiaryCount?: number;
  lastInactivity?: number;
  inactivityThreshold?: number;
  firstCid?: string | null;
  firstBeneficiary?: Address | null;
}

/**
 * The vault read-out: a dot-matrix wheel that scatters under the pointer over
 * a hairline ledger of the will's live state.
 */
export function VaultVisual({
  ownerKey,
  status = "active",
  mediaCount = 8,
  beneficiaryCount = 3,
  lastInactivity,
  inactivityThreshold,
  firstCid,
  firstBeneficiary,
}: VaultVisualProps) {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const displayOwner = ownerKey
    ? `${ownerKey.slice(0, 4)}…${ownerKey.slice(-4)}`
    : "7H4q…wQ2P";

  let timerText = "03d 14h 22m";
  let progressPct = 62;
  const isClaimable = status === "claimable";

  if (
    lastInactivity !== undefined &&
    inactivityThreshold !== undefined &&
    !isClaimable
  ) {
    const totalWindowMs = inactivityThreshold * 1000;
    const elapsedMs = now > 0 ? Math.max(now - lastInactivity * 1000, 0) : 0;
    const remainingMs = Math.max(totalWindowMs - elapsedMs, 0);
    const progress =
      totalWindowMs > 0 ? Math.min(elapsedMs / totalWindowMs, 1) : 0;
    progressPct = Math.round((1 - progress) * 100);

    if (remainingMs <= 0) {
      timerText = "00d 00h 00m";
    } else {
      const totalSec = Math.floor(remainingMs / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const pad = (n: number) => n.toString().padStart(2, "0");
      timerText = `${pad(d)}d ${pad(h)}h ${pad(m)}m`;
    }
  } else if (isClaimable) {
    timerText = "00d 00h 00m";
    progressPct = 0;
  }

  const ipfsText = firstCid
    ? `${firstCid.slice(0, 6)}…${firstCid.slice(-4)}`
    : "cid pinned";

  const heirText = firstBeneficiary
    ? `${firstBeneficiary.slice(0, 4)}…${firstBeneficiary
        
        .slice(-4)}`
    : "9xVu…kP1";

  const barColor = isClaimable
    ? "var(--danger)"
    : progressPct < 20
      ? "var(--warn)"
      : "var(--neon)";

  const rows: [string, string][] = [
    ["Owner", displayOwner],
    ["Sealed", `${mediaCount} documents`],
    ["Beneficiaries", String(beneficiaryCount)],
    ["First CID", ipfsText],
    ["First heir", heirText],
  ];

  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="inline-flex items-center gap-2 label-mono">
          <span
            className={`size-1.5 rounded-full ${
              isClaimable ? "bg-danger" : "bg-neon"
            }`}
          />
          Will {status}
        </span>
        <span className="index-mono">fig. 02</span>
      </div>

      <div className="flex items-center justify-center px-4 py-6 text-muted">
        <div className="w-52">
          <DotField
            paint={paintVaultWheel}
            aspect={1}
            cell={4}
            fill={0.6}
            radius={90}
            force={30}
            className="block w-full cursor-crosshair"
            ariaLabel="Vault wheel"
          />
        </div>
      </div>

      <dl className="border-t border-border">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between border-b border-border px-4 py-2.5"
          >
            <dt className="label-mono">{k}</dt>
            <dd className="font-mono text-[12px] text-foreground">
              <ScrambleText text={v} speed={34} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="px-4 py-4">
        <div className="flex items-center justify-between label-mono">
          <span>Inactivity timer</span>
          <span className="font-mono text-[12px] tabular-nums text-foreground">
            {timerText}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full bg-[rgba(233,229,220,0.07)]">
          <div
            className="h-full transition-[width] duration-1000 ease-out"
            style={{ width: `${progressPct}%`, background: barColor }}
          />
        </div>
      </div>
    </div>
  );
}
