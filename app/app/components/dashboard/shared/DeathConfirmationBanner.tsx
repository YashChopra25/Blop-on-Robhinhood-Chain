"use client";

import { FC, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import type { WillView } from "@/lib/evm/types";
import { GRACE_PERIOD_SECONDS } from "@/lib/evm/config";
import { humanizeError, willStatusLabel } from "@/lib/utils";

/**
 * The owner's escape hatch from a wrong death confirmation (C3).
 *
 * This is the single most important thing a living owner can see. Before the
 * `revoke_death_confirmation` instruction existed, one custodian confirming
 * early locked the owner out of their own will permanently: every owner action
 * is gated on `Active`, so they could not ping, reconfigure, withdraw their
 * tokens or delete the will, while the remaining custodians walked it to
 * Claimable and distributed the estate of someone still alive.
 *
 * It renders on every dashboard page, not just one tab, because an owner
 * returning from a long trip may land anywhere — and the window to act is
 * finite.
 */

interface DeathConfirmationBannerProps {
  will: WillView | null;
  refresh: () => void;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "expired";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const DeathConfirmationBanner: FC<DeathConfirmationBannerProps> = ({
  will,
  refresh,
}) => {
  const vault = useVault();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // A live countdown: the deadline is the whole point of the banner.
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!will) return null;
  const status = willStatusLabel(will.status);
  if (status === "active") return null;

  const claimableAt = Number(will.claimableAt ?? 0);
  const graceEndsAt = claimableAt + GRACE_PERIOD_SECONDS;
  const inGrace = status === "claimable" && now < graceEndsAt;
  // Pending means quorum was never reached, so revoking is always available.
  const canRevoke = status === "pendingInheritance" || inGrace;
  const secondsLeft = graceEndsAt - now;

  const onRevoke = async () => {
    setBusy(true);
    const id = toast.loading("Cancelling the death confirmation…");
    try {
      await vault.revokeDeathConfirmation();
      toast.success(
        "Confirmation cancelled. Your will is active again and the timer has restarted.",
        { id }
      );
      refresh();
    } catch (e) {
      toast.error(humanizeError(e), { id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/8 p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-200">
              {status === "claimable"
                ? "Your custodians have confirmed your death"
                : "A custodian has started death confirmation"}
            </p>

            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-red-100/80">
              {canRevoke ? (
                <>
                  If you are reading this, that is wrong. Cancel it now — this
                  restores your will to active, restarts the inactivity timer,
                  and voids every confirmation cast so far. Nothing has been
                  distributed:{" "}
                  {status === "claimable"
                    ? "claims stay frozen for the whole grace period."
                    : "quorum has not been reached."}
                </>
              ) : (
                <>
                  The grace period has ended and your heirs may now claim, so
                  this can no longer be cancelled on-chain. Contact your
                  custodians and beneficiaries directly.
                </>
              )}
            </p>

            {status === "claimable" && (
              <p className="mt-2 font-mono text-xs text-red-200/70">
                {secondsLeft > 0
                  ? `Time left to cancel: ${formatRemaining(secondsLeft)}`
                  : "Cancellation window closed"}
              </p>
            )}
          </div>
        </div>

        {canRevoke && (
          <button
            type="button"
            onClick={onRevoke}
            disabled={busy}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-red-500/90 px-4 text-sm font-semibold text-foreground transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Cancelling…" : "I'm alive — cancel this"}
          </button>
        )}
      </div>
    </div>
  );
};
