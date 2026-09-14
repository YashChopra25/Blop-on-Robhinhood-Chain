"use client";

import { FC } from "react";
import { Inbox, RefreshCw } from "lucide-react";
import { useInheritance } from "@/hooks/useInheritance";
import { InheritanceCard } from "./InheritanceCard";

const Banner: FC<{ tone: "urgent" | "warn" | "info"; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const cls =
    tone === "urgent"
      ? "border-[var(--neon)]/30 bg-[var(--neon)]/[0.06] text-neon"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
        : "border-sky-500/25 bg-sky-500/[0.05] text-sky-300";
  return (
    <p className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium ${cls}`}>
      {children}
    </p>
  );
};

export const InheritanceList: FC = () => {
  const {
    items,
    claimableNowCount,
    awaitingGraceCount,
    closingSoonCount,
    needsKeyCount,
    loading,
    error,
    refresh,
  } = useInheritance();

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted">
        <div className="size-3 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
        <span>Searching Robinhood Chain for wills that name you…</span>
      </div>
    );
  }

  if (error) {
    return <p className="py-4 font-mono text-xs text-red-400">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-black/10 py-10 text-center">
        <Inbox className="size-5 text-muted" />
        <p className="text-xs font-semibold text-foreground">
          No wills name you as an heir
        </p>
        <p className="max-w-xs text-[11px] leading-relaxed text-muted">
          When someone adds your wallet as a beneficiary, their will appears here
          automatically — no invitation to accept.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted">
          Wills naming your wallet as an heir, most time-critical first. Sealed
          files open once custodians confirm the owner&apos;s passing and the
          revocation window that follows expires.
        </p>
        <button
          onClick={refresh}
          disabled={loading}
          title="Refresh"
          className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Deadlines first: what an heir loses by not looking, before the list. */}
      {closingSoonCount > 0 && (
        <Banner tone="warn">
          {closingSoonCount}{" "}
          {closingSoonCount === 1 ? "inheritance is" : "inheritances are"}{" "}
          approaching the end of the claim window. After it closes, unclaimed
          tokens return to the estate.
        </Banner>
      )}
      {claimableNowCount > 0 && (
        <Banner tone="urgent">
          {claimableNowCount}{" "}
          {claimableNowCount === 1 ? "inheritance is" : "inheritances are"} open
          to claim right now.
        </Banner>
      )}
      {awaitingGraceCount > 0 && (
        <Banner tone="info">
          {awaitingGraceCount}{" "}
          {awaitingGraceCount === 1 ? "will has" : "wills have"} reached
          custodian quorum and{" "}
          {awaitingGraceCount === 1 ? "is" : "are"} inside the owner&apos;s
          revocation window — claims open when it ends.
        </Banner>
      )}
      {needsKeyCount > 0 && (
        <Banner tone="warn">
          {needsKeyCount}{" "}
          {needsKeyCount === 1 ? "will needs" : "wills need"} your document key.
          Documents are sealed to whoever holds a key at upload time, so
          anything uploaded before you register can never be opened by you.
        </Banner>
      )}

      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <InheritanceCard key={item.will.owner} item={item} />
        ))}
      </div>
    </div>
  );
};
