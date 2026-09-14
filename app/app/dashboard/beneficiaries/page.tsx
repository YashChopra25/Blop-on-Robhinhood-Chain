"use client";

import { FC } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { BeneficiaryManager } from "@/app/components/dashboard/beneficiary/BeneficiaryManager";
import { WillSetupChecklist } from "@/app/components/dashboard/shared/WillSetupChecklist";

const BeneficiariesPage: FC = () => {
  const { data, refresh, isActive, readiness } = useDashboard();
  const will = data?.will ?? null;

  // With no will, the checklist leads with "Create your will" and links there.
  if (!will) {
    return <WillSetupChecklist readiness={readiness} action="add assets to it" />;
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full animate-fade-in">
      {!readiness.canAddAssets && (
        <WillSetupChecklist readiness={readiness} action="add assets to it" />
      )}
      <div className="rounded-2xl border border-border bg-white/2 p-6 glass-strong">
        <BeneficiaryManager
          refresh={refresh}
          beneficiaries={data?.beneficiaries ?? []}
          totalBps={will.totalAllocatedBps}
          isActive={isActive}
        />
      </div>
    </div>
  );
};

export default BeneficiariesPage;
