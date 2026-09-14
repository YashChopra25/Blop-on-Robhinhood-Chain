"use client";

import { FC } from "react";
import type { Address } from "viem";
import { short } from "../shared/ui";

/**
 * Colours for the allocation segments. Fixed and cycled by index so a given
 * heir keeps the same colour between the bar and the list below it.
 */
export const ALLOCATION_COLORS = [
  "var(--accent)",
  "var(--neon)",
  "#f59e0b",
  "#38bdf8",
  "#c084fc",
  "#fb7185",
  "#34d399",
  "#facc15",
];

export function allocationColor(index: number): string {
  return ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];
}

interface AllocationBarProps {
  /** In on-chain order, so colours match the list. */
  slices: { wallet: Address; bps: number }[];
  /** `will.totalAllocatedBps`, in basis points. */
  totalBps: number;
}

/**
 * How the escrowed tokens are split, including the part that is not split.
 *
 * The unallocated remainder matters: nobody can claim it, and once the heirs'
 * claim window closes `sweep_token_vault` returns it to the estate. An owner
 * who leaves 30% unassigned has almost certainly not decided to do that.
 */
export const AllocationBar: FC<AllocationBarProps> = ({ slices, totalBps }) => {
  const unallocatedBps = Math.max(10_000 - totalBps, 0);
  const allocatedPct = totalBps / 100;

  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Estate allocated
          </p>
          <p
            className={`mt-0.5 text-2xl font-bold leading-none tabular-nums ${
              unallocatedBps === 0 ? "text-[var(--neon)]" : "text-foreground"
            }`}
          >
            {allocatedPct}%
          </p>
        </div>
        <p className="text-[11px] text-muted">
          {unallocatedBps === 0 ? (
            <span className="text-[var(--neon)]">Fully allocated</span>
          ) : (
            <>
              <span className="font-semibold text-amber-300">
                {unallocatedBps / 100}%
              </span>{" "}
              unassigned
            </>
          )}
        </p>
      </div>

      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-white/5">
        {slices.map((s, i) => (
          <div
            key={s.wallet}
            title={`${short(s.wallet)} — ${s.bps / 100}%`}
            style={{
              width: `${s.bps / 100}%`,
              background: allocationColor(i),
            }}
            className="h-full border-r border-black/30 last:border-r-0 transition-all duration-500"
          />
        ))}
        {unallocatedBps > 0 && (
          <div
            title={`Unassigned — ${unallocatedBps / 100}%`}
            style={{ width: `${unallocatedBps / 100}%` }}
            className="h-full bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.10)_0_6px,transparent_6px_12px)]"
          />
        )}
      </div>

      {unallocatedBps > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/85">
          <span className="font-semibold text-amber-300">
            {unallocatedBps / 100}% of your escrowed tokens has no heir.
          </span>{" "}
          Nobody can claim that share. Once the heirs&apos; claim window closes
          it is swept back to your own wallet — which only helps if someone can
          still reach it.
        </p>
      )}
    </div>
  );
};
