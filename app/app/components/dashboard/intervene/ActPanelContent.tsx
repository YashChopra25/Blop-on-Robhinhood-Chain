"use client";

import { FC, useEffect, useState } from "react";
import type { Address } from "viem";
import { useVault } from "@/hooks/useVault";
import { TxButton, short } from "../shared/ui";
import { InheritedDocumentsList } from "./InheritedDocumentsList";
import { RecipientKeyCard } from "./RecipientKeyCard";
import type { BeneficiaryView, CustodianView, WillBundle } from "@/hooks/useWill";

interface ActPanelContentProps {
  data: WillBundle;
  owner: Address;
  me: Address | null;
  status: string | null;
  claimable: boolean;
  myCustodian?: CustodianView;
  myBeneficiary?: BeneficiaryView;
  refresh: () => void;
}

export const ActPanelContent: FC<ActPanelContentProps> = ({
  data,
  owner,
  me,
  status,
  claimable,
  myCustodian,
  myBeneficiary,
  refresh,
}) => {
  const vault = useVault();

  // Live clock (set off-render to keep the component pure), mirroring CountdownTracker.
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const will = data?.will ?? null;

  if (!will) return null;

  // The program enforces the dead-man's switch: a custodian can only confirm
  // death once the owner has been silent past their inactivity threshold. Gate
  // the button on the same rule so the UI doesn't offer a transaction that would
  // revert with `OwnerStillActive`.
  // Both fields are `bigint` (uint64 seconds); the sum is far inside Number's
  // safe integer range, so the conversion is exact.
  const eligibleAtMs =
    Number(will.lastActiveAt + will.inactivityThreshold) * 1000;
  const inactivityWindowExpired = now > 0 && now >= eligibleAtMs;

  return (
    <div className="mt-4 flex flex-col gap-5">
      {/* C5: an heir must publish an encryption key BEFORE the owner uploads,
          so this sits at the top of everything they can act on. */}
      {myBeneficiary && <RecipientKeyCard ownerAddress={owner} />}

      {/* Will Overview Tag */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-black/25 p-4">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Will Account Status</h4>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border uppercase tracking-wider ${
            status === "active"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : status === "claimable"
              ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse"
              : "bg-white/10 border-border-strong text-white/85"
          }`}>
            <span className={`size-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
            {status}
          </span>
          <span className="text-xs text-muted">
            {will.approvalsReceived} of {will.minApprovals} custodian approvals · {will.mediaCount} sealed media · {will.beneficiaryCount} heirs
          </span>
        </div>
      </div>

      {/* Custodian actions */}
      {myCustodian ? (
        <div className="rounded-xl border border-border bg-white/1 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Your Role: Custodian</h4>
            <span className="rounded bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-white/80">Authorized</span>
          </div>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            {myCustodian.hasApproved
              ? "You have already confirmed this person's death. Awaiting other custodians if quorum is not met."
              : "Confirm death only if you have verified the owner has passed away and cannot check-in. This action is recorded on the blockchain and cannot be undone."}
          </p>
          {!myCustodian.hasApproved && status !== "claimable" && (
            <div className="mt-3.5">
              {inactivityWindowExpired ? (
                <TxButton
                  tone="danger"
                  confirm="Confirm the will owner's passing? This is permanent and will notify other custodians / enable inheritance claiming."
                  action={() => vault.confirmDeath(owner)}
                  onDone={refresh}
                >
                  Confirm passing (Death)
                </TxButton>
              ) : (
                <p className="text-[11px] text-amber-400/90 leading-relaxed">
                  The owner&apos;s inactivity window has not elapsed yet. Death can
                  only be confirmed after they have been inactive past their
                  threshold (eligible{" "}
                  {new Date(eligibleAtMs).toLocaleString()}).
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        me && (
          <p className="text-[10px] text-muted font-mono">
            Connected wallet ({short(me)}) is not a designated custodian on this will.
          </p>
        )
      )}

      {/* Beneficiary actions */}
      {myBeneficiary && (
        <div className="rounded-xl border border-border bg-white/1 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Your Role: Beneficiary</h4>
            <span className="rounded bg-(--accent)/15 border border-(--accent)/20 px-2 py-0.5 text-[9px] uppercase tracking-wide text-accent">
              Heir · {myBeneficiary.allocationBps / 100}% share
            </span>
          </div>
          
          {!claimable ? (
            <p className="mt-2 text-xs text-muted leading-relaxed">
              The will is currently active. You can claim your inheritance allocation once enough custodians submit passing confirmations and the inactivity window expires.
            </p>
          ) : myBeneficiary.hasClaimed ? (
            <p className="mt-2 text-xs text-neon font-medium">
              Inheritance claimed successfully. You can now access and preview all the sealed documents below.
            </p>
          ) : (
            <div className="mt-3">
              <TxButton
                action={() => vault.claimInheritance(owner)}
                onDone={refresh}
              >
                Claim inheritance & decrypt files
              </TxButton>
            </div>
          )}
        </div>
      )}

      {/* Media access list (Only for verified beneficiaries once claimable) */}
      {claimable && myBeneficiary && (
        <InheritedDocumentsList media={data.media} owner={owner} />
      )}
    </div>
  );
};
