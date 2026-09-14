"use client";

import { FC } from "react";
import type { Address } from "viem";
import { CheckCircle2, Hourglass, TriangleAlert } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { TxButton } from "../shared/ui";
import { formatRelativeDuration } from "@/lib/utils";
import type { ClaimTimeline } from "@/app/types/inheritance.types";
import type { BeneficiaryView } from "@/lib/evm/types";

interface InheritanceClaimCardProps {
  owner: Address;
  beneficiary: BeneficiaryView;
  timeline: ClaimTimeline;
  refresh: () => void;
}

export const InheritanceClaimCard: FC<InheritanceClaimCardProps> = ({
  owner,
  beneficiary,
  timeline,
  refresh,
}) => {
  const vault = useVault();
  const sharePct = beneficiary.allocationBps / 100;
  const { phase } = timeline;

  return (
    <div className="rounded-xl border border-border bg-white/[0.01] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Your Share
        </h3>
        <span className="rounded border border-[var(--accent)]/20 bg-[var(--accent)]/15 px-2 py-0.5 text-[9px] uppercase tracking-wide text-accent">
          Heir · {sharePct}% of tokens
        </span>
      </div>

      <p className="mt-1 text-[10px] leading-relaxed text-muted">
        Your {sharePct}% share applies to escrowed tokens. All documents &amp;
        media are shared with every heir in full.
      </p>

      {/* Every branch below mirrors a guard in `claim_inheritance`, so the
          button is only ever offered when the program would accept it. */}
      {phase === "active" || phase === "pending" ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          You can claim this inheritance once enough custodians confirm the
          owner&apos;s passing and the revocation window that follows expires.
        </p>
      ) : phase === "grace" ? (
        <div className="mt-3 flex gap-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
          <Hourglass className="mt-0.5 size-4 shrink-0 animate-pulse text-sky-400" />
          <div>
            <p className="text-xs font-medium text-sky-300">
              Claims are frozen for another{" "}
              {formatRelativeDuration(timeline.secondsUntilOpen * 1000)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-sky-200/80">
              Quorum has been reached, but the owner can still cancel the
              confirmation until the grace period ends. The program rejects any
              claim signed before then — nothing is lost by waiting.
            </p>
          </div>
        </div>
      ) : beneficiary.hasClaimed ? (
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-[var(--neon)]/25 bg-[var(--neon)]/5 p-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--neon)]" />
          <div>
            <p className="text-xs font-medium text-neon">
              Inheritance claimed — recorded on-chain.
            </p>
            {phase === "open" && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Each escrowed token is claimed separately. You have{" "}
                {formatRelativeDuration(timeline.secondsUntilClose * 1000)} left
                to collect any you have not taken yet.
              </p>
            )}
          </div>
        </div>
      ) : phase === "closed" ? (
        <div className="mt-3 flex gap-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" />
          <div>
            <p className="text-xs font-medium text-red-300">
              The claim window has closed
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-red-200/80">
              Anyone may now close the heir accounts and return unclaimed tokens
              to the estate. If your account has not been torn down yet a claim
              may still land, but it is no longer guaranteed.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-muted">
            Recording your claim marks this inheritance as received on-chain.
            The sealed documents below are already open to you — this does not
            gate them, and it does not move tokens, which are claimed one at a
            time under &ldquo;Inherited tokens&rdquo;.
          </p>
          {timeline.closingSoon && (
            <p className="text-[11px] font-medium text-amber-300">
              {formatRelativeDuration(timeline.secondsUntilClose * 1000)} left
              before the claim window closes.
            </p>
          )}
          <TxButton
            action={() => vault.claimInheritance(owner)}
            onDone={refresh}
          >
            Record my claim
          </TxButton>
        </div>
      )}
    </div>
  );
};
