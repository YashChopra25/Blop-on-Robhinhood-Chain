"use client";

import { FC } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { CustodianManager } from "@/app/components/dashboard/custodian/CustodianManager";
import { WillSetupChecklist } from "@/app/components/dashboard/shared/WillSetupChecklist";

const CustodiansPage: FC = () => {
  const { data, refresh, isActive, readiness } = useDashboard();
  const will = data?.will ?? null;

  // With no will, the checklist leads with "Create your will" and links there.
  if (!will) {
    return <WillSetupChecklist readiness={readiness} action="add assets to it" />;
  }

  return (
    // No outer card: the manager lays itself out as a row of two cards over a
    // full-width list, and wrapping that in another panel just adds inset.
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full animate-fade-in">
      {/* Custodians and the quorum are what unblock the will, so the outstanding
          steps are shown right where they get fixed. */}
      {!readiness.canAddAssets && (
        <WillSetupChecklist readiness={readiness} action="add assets to it" />
      )}
      <CustodianManager
        refresh={refresh}
        custodians={data?.custodians ?? []}
        isActive={isActive}
        minApprovals={will.minApprovals}
        approvalsReceived={will.approvalsReceived}
        approvalEpoch={will.approvalEpoch}
      />
    </div>
  );
};

export default CustodiansPage;
