import type { RoleWill } from "@/app/types/roles.types";
import type {
  ClaimPhase,
  ClaimTimeline,
  InheritanceSummary,
  LockState,
} from "@/app/types/inheritance.types";
import { formatRelativeDuration } from "@/lib/utils";

/**
 * Mirrors the contract's `WillLib` constants. Reaching custodian quorum does NOT
 * release the estate; two windows run back-to-back from `will.claimableAt`:
 *
 *   quorum reached ──┬── GRACE_PERIOD ──┬── CLAIM_WINDOW ──┬── teardown
 *                    │ owner may still  │ heirs claim      │ anyone may close
 *                    │ REVOKE; claims   │ assets & media   │ heir accounts and
 *                    │ are frozen       │                  │ sweep the vaults
 *
 * `claimInheritance` and `claimToken` both call `requireClaimsOpen`, so a claim
 * attempted during the grace period reverts with `GracePeriodNotElapsed`. After
 * the claim window an heir who never claimed can lose their share to a teardown
 * crank.
 *
 * Unlike the Solana version, these constants are a DISPLAY fallback rather than
 * the authority: `getWill` returns `graceEndsAt`, `claimWindowEndsAt`,
 * `claimsOpen` and `teardownOpen` computed by the contract itself, and
 * `RoleWill` carries them. The maths below is used to render a countdown
 * between reads, never to decide whether a button is enabled.
 */
export const GRACE_PERIOD_SECONDS = 7 * 24 * 60 * 60;
export const CLAIM_WINDOW_SECONDS = 90 * 24 * 60 * 60;

/** Inside this much of the claim deadline, the UI escalates to a warning. */
export const CLOSING_SOON_SECONDS = 14 * 24 * 60 * 60;

/** Map an on-chain `WillStatus` label onto what the heir can do with it. */
export function lockStateOf(status: string): LockState {
  if (status === "claimable") return "unlocked";
  if (status === "pendingInheritance") return "pending";
  return "active";
}

const NO_TIMELINE = (phase: ClaimPhase): ClaimTimeline => ({
  phase,
  claimableAt: null,
  graceEndsAt: null,
  claimWindowEndsAt: null,
  secondsUntilOpen: 0,
  secondsUntilClose: 0,
  canClaimNow: false,
  closingSoon: false,
});

/**
 * Where a will sits on the post-death timeline, from the heir's point of view.
 *
 * `nowSecs` is passed in rather than read from the clock so the same value
 * drives every row in a list, and so this stays pure and testable. Pass `null`
 * before the client clock is known: the phase is still derived from status, but
 * nothing is reported as claimable, so a countdown never renders on the server.
 */
export function claimTimeline(
  status: string,
  claimableAtSecs: number,
  nowSecs: number | null,
): ClaimTimeline {
  const lock = lockStateOf(status);
  if (lock === "active") return NO_TIMELINE("active");
  if (lock === "pending") return NO_TIMELINE("pending");

  // Claimable, but `claimable_at` is zero — should not happen, and treating it
  // as "open" would invite a transaction that the program rejects.
  if (!claimableAtSecs) return NO_TIMELINE("grace");

  const graceEndsAt = claimableAtSecs + GRACE_PERIOD_SECONDS;
  const claimWindowEndsAt = graceEndsAt + CLAIM_WINDOW_SECONDS;

  if (nowSecs === null) {
    return {
      ...NO_TIMELINE("grace"),
      claimableAt: claimableAtSecs,
      graceEndsAt,
      claimWindowEndsAt,
    };
  }

  const secondsUntilOpen = Math.max(graceEndsAt - nowSecs, 0);
  const secondsUntilClose = Math.max(claimWindowEndsAt - nowSecs, 0);

  let phase: ClaimPhase = "open";
  if (nowSecs < graceEndsAt) phase = "grace";
  else if (nowSecs >= claimWindowEndsAt) phase = "closed";

  return {
    phase,
    claimableAt: claimableAtSecs,
    graceEndsAt,
    claimWindowEndsAt,
    secondsUntilOpen,
    secondsUntilClose,
    canClaimNow: phase === "open",
    closingSoon: phase === "open" && secondsUntilClose <= CLOSING_SOON_SECONDS,
  };
}

function noteFor(
  will: RoleWill,
  lock: LockState,
  timeline: ClaimTimeline,
): string {
  if (lock === "active") {
    return "The owner is still checking in. Nothing is released while the will is active.";
  }
  if (lock === "pending") {
    const remaining = Math.max(will.minApprovals - will.approvalsReceived, 0);
    return `${will.approvalsReceived} of ${will.minApprovals} custodians have confirmed the passing — ${remaining} more needed.`;
  }

  switch (timeline.phase) {
    case "grace":
      return timeline.secondsUntilOpen > 0
        ? `Quorum reached. Claims open in ${formatRelativeDuration(
            timeline.secondsUntilOpen * 1000,
          )}, once the owner's window to revoke has passed.`
        : "Quorum reached. Claims open once the owner's window to revoke has passed.";
    case "open":
      if (will.hasClaimed) {
        return `You have claimed this inheritance. ${formatRelativeDuration(
          timeline.secondsUntilClose * 1000,
        )} left to claim any remaining tokens.`;
      }
      return `Open to claim — ${formatRelativeDuration(
        timeline.secondsUntilClose * 1000,
      )} left before the claim window closes.`;
    case "closed":
      return will.hasClaimed
        ? "You claimed this inheritance. The claim window has since closed."
        : "The claim window has closed. Anyone may now reclaim the accounts, and unclaimed tokens return to the estate.";
    default:
      return "Custodians confirmed the passing.";
  }
}

export function summarizeInheritance(
  will: RoleWill,
  nowSecs: number | null = null,
): InheritanceSummary {
  const lock = lockStateOf(will.status);
  const timeline = claimTimeline(will.status, will.claimableAt, nowSecs);
  return {
    will,
    lock,
    timeline,
    note: noteFor(will, lock, timeline),
    // A key can only be registered while the will is Active, and documents are
    // sealed to whoever holds one at upload time — so an unkeyed heir on a live
    // will is looking at the only window they will ever get.
    needsKey: lock === "active" && !will.hasEncryptionKey,
  };
}

/**
 * Most urgent first. Ordered by what the heir can lose by not looking: a
 * closing claim window outranks a fresh one, an open claim outranks a grace
 * period, and a live will they still need to key outranks a quiet one.
 */
const PHASE_ORDER: Record<ClaimPhase, number> = {
  open: 0,
  grace: 1,
  closed: 2,
  pending: 3,
  active: 4,
};

export function byUrgency(a: InheritanceSummary, b: InheritanceSummary): number {
  const byPhase =
    PHASE_ORDER[a.timeline.phase] - PHASE_ORDER[b.timeline.phase];
  if (byPhase !== 0) return byPhase;

  // Within the open phase, whichever closes first needs attention first.
  if (a.timeline.phase === "open") {
    return a.timeline.secondsUntilClose - b.timeline.secondsUntilClose;
  }
  // A will still waiting on a key is the one thing an heir can act on early.
  if (a.needsKey !== b.needsKey) return a.needsKey ? -1 : 1;
  return 0;
}
