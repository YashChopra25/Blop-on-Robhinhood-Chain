"use client";

import { FC } from "react";
import Link from "next/link";
import { ArrowRight, Check, Lock, TriangleAlert } from "lucide-react";
import type { Requirement, WillReadiness } from "@/lib/willReadiness";

interface WillSetupChecklistProps {
  readiness: WillReadiness;
  /** What the user is being stopped from doing, e.g. "seal a document". */
  action: string;
  /** Also list the advisory steps the chain does not enforce. Default true. */
  showAdvisory?: boolean;
}

const Row: FC<{ req: Requirement }> = ({ req }) => {
  const tone = req.done
    ? "border-border bg-white/[0.02]"
    : req.blocking
      ? "border-amber-500/25 bg-amber-500/[0.06]"
      : "border-border bg-white/[0.02]";

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between ${tone}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
            req.done
              ? "border-[var(--neon)]/40 bg-[var(--neon)]/10 text-[var(--neon)]"
              : req.blocking
                ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                : "border-border-strong bg-white/5 text-muted"
          }`}
        >
          {req.done ? (
            <Check className="size-3" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
        </span>
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${
              req.done ? "text-white/55 line-through" : "text-foreground"
            }`}
          >
            {req.title}
            {!req.done && !req.blocking && (
              <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted">
                Recommended
              </span>
            )}
          </p>
          {!req.done && (
            <p className="mt-1 text-xs leading-relaxed text-white/65">
              {req.detail}
            </p>
          )}
        </div>
      </div>

      {!req.done && (
        <Link
          href={req.href}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-white/85 transition hover:border-border-strong hover:bg-white/5 hover:text-foreground"
        >
          {req.cta}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </li>
  );
};

/**
 * The setup steps a will needs before it can hold assets, shown *before* the
 * user invests effort in an upload rather than after.
 *
 * `add_media_reference` and `add_token` both call `require_quorum_reachable`, so
 * without a reachable quorum the final transaction fails with
 * `QuorumUnreachable` (6025) — after the file has already been encrypted and
 * pinned to IPFS. Surfacing the same rule here is what stops that dead end.
 */
export const WillSetupChecklist: FC<WillSetupChecklistProps> = ({
  readiness,
  action,
  showAdvisory = true,
}) => {
  const blocked = readiness.blockers.length > 0;
  const rows = readiness.requirements.filter(
    (r) => r.blocking || showAdvisory || r.done,
  );

  return (
    <section
      className={`rounded-2xl border p-6 glass-strong ${
        blocked
          ? "border-amber-500/30 bg-amber-500/[0.04]"
          : "border-border bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3 border-b border-border pb-4">
        <div
          className={`rounded-xl border p-2 ${
            blocked
              ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
              : "border-border bg-white/5 text-muted"
          }`}
        >
          {blocked ? (
            <Lock className="size-4" />
          ) : (
            <Check className="size-4 text-[var(--neon)]" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {blocked
              ? `Finish setting up your will before you ${action}`
              : "Your will is ready"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-white/65">
            {blocked ? (
              <>
                The contract rejects assets added to a will whose custodian quorum can
                never be met — the transaction fails with{" "}
                <span className="font-mono text-amber-300">
                  QuorumUnreachable (6025)
                </span>
                . Complete the steps below and this page unlocks.
              </>
            ) : (
              <>
                {readiness.minApprovals} of {readiness.custodianCount}{" "}
                {readiness.custodianCount === 1 ? "custodian" : "custodians"}{" "}
                must confirm before your estate can be claimed.
              </>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((req) => (
          <Row key={req.id} req={req} />
        ))}
      </ul>

      {!blocked && readiness.warnings.length > 0 && (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-200/85">
            The steps marked <strong>Recommended</strong> are not enforced
            on-chain, but they cannot be applied retroactively — an heir added
            after an upload can never open it.
          </p>
        </div>
      )}
    </section>
  );
};
