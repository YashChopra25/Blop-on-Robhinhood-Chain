"use client";

import { FC } from "react";
import type { TokenVaultView } from "@/lib/evm/types";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { useInheritedWill } from "@/hooks/useInheritedWill";
import { useInheritedTokens } from "@/hooks/useInheritedTokens";
import { short } from "../shared/ui";
import { InheritedDocumentsList } from "../intervene/InheritedDocumentsList";
import { RecipientKeyCard } from "../intervene/RecipientKeyCard";
import { InheritedTokensList } from "./InheritedTokensList";
import { InheritanceStatusCard } from "./InheritanceStatusCard";
import { InheritanceClaimCard } from "./InheritanceClaimCard";
import { ClaimTimelineCard } from "./ClaimTimelineCard";
import { INHERITANCE_ROOT } from "./inheritance.constants";

interface InheritanceDetailProps {
  ownerStr: string;
}

/** Stable identity so `useInheritedTokens` doesn't see a new array every render. */
const NO_TOKEN_VAULTS: TokenVaultView[] = [];

const Notice: FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl border border-border bg-black/10 p-4 text-xs leading-relaxed text-muted">
    {children}
  </p>
);

export const InheritanceDetail: FC<InheritanceDetailProps> = ({ ownerStr }) => {
  const {
    owner,
    invalidOwner,
    data,
    exists,
    lock,
    timeline,
    me,
    myBeneficiary,
    loading,
    error,
    refresh,
  } = useInheritedWill(ownerStr);
  // `claimableAmount` computes each share on-chain, so the hook needs only the
  // will's owner and its vaults — not the heir's allocation or address, which
  // the Solana version had to pass in to recompute the share client-side.
  const {
    tokens: tokenDisplays,
    loading: loadingTokens,
    refresh: refreshTokens,
  } = useInheritedTokens(owner, data?.tokenVaults ?? NO_TOKEN_VAULTS);

  const refreshAll = () => {
    refresh();
    refreshTokens();
  };

  const body = () => {
    if (invalidOwner) {
      return <Notice>“{ownerStr}” is not a valid EVM address.</Notice>;
    }
    if (loading && !data) {
      return (
        <div className="flex items-center gap-2 py-6 text-xs text-muted">
          <div className="size-3 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
          <span>Loading will…</span>
        </div>
      );
    }
    if (error) {
      return <p className="py-4 font-mono text-xs text-red-400">{error}</p>;
    }
    if (!owner || !data || !exists || !data.will || !lock || !timeline) {
      return (
        <Notice>
          No will exists for {owner ? short(owner) : "this address"}.
        </Notice>
      );
    }
    if (!myBeneficiary) {
      return (
        <Notice>
          This will exists, but{" "}
          {me ? `your wallet (${short(me)})` : "your wallet"} is not named as an
          heir on it.
        </Notice>
      );
    }

    // Documents are readable as soon as the will is claimable; only *claims*
    // wait for the grace period. Keeping the two apart is the difference
    // between "your files are here" and a transaction the program rejects.
    const documentsOpen = lock === "unlocked";

    return (
      <div className="flex flex-col gap-5">
        <InheritanceStatusCard
          owner={owner}
          will={data.will}
          timeline={timeline}
          allocationBps={myBeneficiary.allocationBps}
        />

        {/* Registration is only accepted while the will is Active, and only
            documents uploaded *after* it can ever be opened by this heir — so
            it belongs at the top of a live will, not buried in another tab. */}
        {lock === "active" && <RecipientKeyCard ownerAddress={owner} />}

        <ClaimTimelineCard timeline={timeline} />

        <InheritanceClaimCard
          owner={owner}
          beneficiary={myBeneficiary}
          timeline={timeline}
          refresh={refreshAll}
        />

        {documentsOpen ? (
          <>
            <InheritedTokensList
              owner={owner}
              tokens={tokenDisplays}
              loading={loadingTokens}
              canClaim={timeline.canClaimNow}
              refresh={refreshAll}
            />
            <InheritedDocumentsList media={data.media} owner={owner} />
            <Notice>
              Documents &amp; media are shared with every heir in full — your
              percentage only governs your share of the escrowed tokens above.
            </Notice>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-black/10 p-4">
            <Lock className="size-4 shrink-0 text-muted" />
            <p className="text-xs leading-relaxed text-muted">
              {data.will.mediaCount} sealed{" "}
              {data.will.mediaCount === 1 ? "file is" : "files are"} and{" "}
              {data.tokenVaults.length} token{" "}
              {data.tokenVaults.length === 1 ? "vault is" : "vaults are"}{" "}
              attached to this will. They are released here once custodians
              confirm the owner&apos;s passing.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={INHERITANCE_ROOT}
        className="inline-flex w-fit items-center gap-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All inheritances
      </Link>
      {body()}
    </div>
  );
};
