"use client";

import { FC, useEffect, useState } from "react";
import { TxButton, type TxActionResult } from "../shared/ui";

interface CountdownTrackerProps {
  lastInactivity: number;
  threshold: number;
  onCheckIn: () => Promise<TxActionResult>;
}

export const CountdownTracker: FC<CountdownTrackerProps> = ({
  lastInactivity,
  threshold,
  onCheckIn,
}) => {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const totalWindowMs = threshold * 1000;
  const elapsedMs = now > 0 ? Math.max(now - lastInactivity * 1000, 0) : 0;
  const remainingMs = Math.max(totalWindowMs - elapsedMs, 0);
  const progress = totalWindowMs > 0 ? Math.min(elapsedMs / totalWindowMs, 1) : 0;

  const isAtRisk = progress > 0.8;
  const isExpired = remainingMs <= 0;

  const formatDuration = (ms: number) => {
    if (ms <= 0) return "00d 00h 00m 00s";
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-white/1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] border uppercase tracking-wider font-semibold ${
              isExpired
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : isAtRisk
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                isExpired
                  ? "bg-red-500 animate-pulse"
                  : isAtRisk
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            {isExpired
              ? "Inactivity Window Expired"
              : isAtRisk
              ? "At Risk - Check in soon"
              : "Active & Healthy"}
          </span>
          <span className="text-xs text-muted">
            Last check-in:{" "}
            {new Date(lastInactivity * 1000).toLocaleDateString()}
          </span>
        </div>

        <TxButton action={onCheckIn}>Reset Timer (Check In)</TxButton>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Time until will becomes claimable
          </p>
          <p className="mt-1 font-mono text-xl sm:text-2xl tabular-nums tracking-wide text-foreground">
            {formatDuration(remainingMs)}
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          Total window:{" "}
          <span className="font-mono text-foreground">
            {Math.round(threshold / 86400)} days
          </span>
        </div>
      </div>

      <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="relative h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${(1 - progress) * 100}%`,
            background: isExpired
              ? "var(--danger)"
              : isAtRisk
              ? "linear-gradient(90deg, var(--warn), var(--danger))"
              : "linear-gradient(90deg, var(--neon), var(--accent))",
          }}
        >
          <div className="absolute inset-0 animate-shimmer rounded-full" />
        </div>
      </div>
    </div>
  );
};
