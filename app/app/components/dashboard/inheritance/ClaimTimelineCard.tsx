"use client";

import { FC } from "react";
import { CheckCircle2, Circle, Hourglass } from "lucide-react";
import { formatCountdown } from "@/lib/utils";
import type { ClaimTimeline } from "@/app/types/inheritance.types";

interface ClaimTimelineCardProps {
  timeline: ClaimTimeline;
}

function whenOf(unixSecs: number | null): string {
  return unixSecs ? new Date(unixSecs * 1000).toLocaleString() : "—";
}

const Milestone: FC<{
  label: string;
  when: number | null;
  state: "done" | "current" | "future";
  detail: string;
}> = ({ label, when, state, detail }) => (
  <li className="flex gap-3">
    <div className="flex flex-col items-center">
      {state === "done" ? (
        <CheckCircle2 className="size-4 shrink-0 text-[var(--neon)]" />
      ) : state === "current" ? (
        <Hourglass className="size-4 shrink-0 animate-pulse text-sky-400" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted" />
      )}
      <span className="mt-1 w-px flex-1 bg-white/10 last:hidden" />
    </div>
    <div className="pb-4">
      <p
        className={`text-xs font-semibold ${
          state === "future" ? "text-muted" : "text-foreground"
        }`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{detail}</p>
      <p className="mt-0.5 font-mono text-[10px] text-muted">{whenOf(when)}</p>
    </div>
  </li>
);

/**
 * The two windows that run after custodian quorum, and where this will sits on
 * them.
 *
 * Neither deadline is visible anywhere on-chain to an heir, yet both decide
 * what they can do: a claim during the grace period is rejected outright, and a
 * claim after the window has closed may find the accounts already torn down.
 */
export const ClaimTimelineCard: FC<ClaimTimelineCardProps> = ({ timeline }) => {
  const { phase } = timeline;
  if (phase === "active" || phase === "pending") return null;

  const countdownMs =
    phase === "grace"
      ? timeline.secondsUntilOpen * 1000
      : phase === "open"
        ? timeline.secondsUntilClose * 1000
        : 0;

  const headline =
    phase === "grace"
      ? "Claims open in"
      : phase === "open"
        ? "Time left to claim"
        : "The claim window has closed";

  return (
    <div
      className={`rounded-xl border p-4 ${
        phase === "closed"
          ? "border-red-500/25 bg-red-500/5"
          : timeline.closingSoon
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-border bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            {headline}
          </p>
          {phase !== "closed" && (
            <p
              className={`mt-1 font-mono text-xl tabular-nums tracking-wide sm:text-2xl ${
                timeline.closingSoon ? "text-amber-300" : "text-foreground"
              }`}
            >
              {formatCountdown(countdownMs)}
            </p>
          )}
        </div>
        {phase === "open" && (
          <p className="text-[11px] text-muted">
            Closes{" "}
            <span className="font-mono text-white/80">
              {whenOf(timeline.claimWindowEndsAt)}
            </span>
          </p>
        )}
      </div>

      <ol className="mt-4 flex flex-col">
        <Milestone
          label="Custodian quorum reached"
          when={timeline.claimableAt}
          state="done"
          detail="Enough custodians confirmed the owner's passing."
        />
        <Milestone
          label="Owner's revocation window ends"
          when={timeline.graceEndsAt}
          state={phase === "grace" ? "current" : "done"}
          detail="Until this passes the owner can still cancel the confirmation, so no claim is accepted."
        />
        <Milestone
          label="Claim window closes"
          when={timeline.claimWindowEndsAt}
          state={
            phase === "open" ? "current" : phase === "closed" ? "done" : "future"
          }
          detail="After this, anyone may close the heir accounts and return unclaimed tokens to the estate."
        />
      </ol>
    </div>
  );
};
