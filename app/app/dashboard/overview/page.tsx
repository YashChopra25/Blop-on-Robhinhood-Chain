"use client";

import { FC } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { WillOverview } from "@/app/components/dashboard/overview/WillOverview";
import { VaultVisual } from "@/app/components/homePage/VaultVisual";
import { LifecycleFlow } from "@/app/components/dashboard/overview/LifecycleFlow";
import { ContextFlowDiagram } from "@/app/components/dashboard/overview/ContextFlowDiagram";
import { WillSetupChecklist } from "@/app/components/dashboard/shared/WillSetupChecklist";

const OverviewPage: FC = () => {
  const { data, vault, status, readiness } = useDashboard();
  const will = data?.will ?? null;

  // With no will, the checklist leads with "Create your will" and links there.
  if (!will) {
    return <WillSetupChecklist readiness={readiness} action="add anything to it" />;
  }

  // The contract stores the CID as a plain string, so there is nothing to
  // decode — the Solana client had to run `bytesToCid` over a `[u8; 64]` here.
  const firstCid = data?.media?.[0]?.cid ?? null;
  const firstBeneficiary = data?.beneficiaries?.[0]?.wallet ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.95fr_1.05fr] gap-8 items-start animate-fade-in">
      <div className="flex flex-col gap-6">
        {/* First thing on the dashboard while the will cannot hold assets — the
            same guard blocks documents and token escrow, so the user should
            meet it here rather than at the end of an upload. */}
        {!readiness.canAddAssets && (
          <WillSetupChecklist readiness={readiness} action="add anything to it" />
        )}
        <WillOverview data={data!} />
        <LifecycleFlow />
        <ContextFlowDiagram />
      </div>

      <div className="flex flex-col gap-6 lg:sticky lg:top-20">
        <div className="rounded-2xl border border-border bg-white/[0.01] p-4 glass overflow-hidden flex flex-col items-center">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] self-start mb-2 pl-1">
            Active Vault Visualizer
          </h3>
          <div className="w-full scale-95 sm:scale-100 origin-center">
            <VaultVisual
              ownerKey={vault.address}
              status={status ?? "unknown"}
              mediaCount={will.mediaCount}
              beneficiaryCount={will.beneficiaryCount}
              lastInactivity={Number(will.lastActiveAt)}
              inactivityThreshold={Number(will.inactivityThreshold)}
              firstCid={firstCid}
              firstBeneficiary={firstBeneficiary}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white/[0.01] p-5 glass">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--warn)]">
            Trustless Architecture
          </h3>
          <p className="mt-2.5 text-xs text-muted leading-relaxed">
            No third party can modify your will settings or preview files. All
            data flows peer-to-peer and through decentralized networks.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OverviewPage;
