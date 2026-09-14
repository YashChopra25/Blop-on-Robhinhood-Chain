"use client";

import { FC } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { MediaManager } from "@/app/components/dashboard/file/MediaManager";
import { WillSetupChecklist } from "@/app/components/dashboard/shared/WillSetupChecklist";

const FilesPage: FC = () => {
  const { data, refresh, isActive, readiness } = useDashboard();
  const will = data?.will ?? null;

  // With no will, the checklist leads with "Create your will" and links there.
  if (!will) {
    return <WillSetupChecklist readiness={readiness} action="seal documents" />;
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full animate-fade-in">
      {/* Shown first, and before the dropzone is reachable: the program refuses
          `add_media_reference` on a will whose quorum can never be met, and by
          then the file has already been encrypted and pinned. */}
      {!readiness.canAddAssets && (
        <WillSetupChecklist readiness={readiness} action="seal documents" />
      )}

      <div className="rounded-2xl border border-border bg-white/[0.02] p-6 glass-strong">
        <MediaManager
          refresh={refresh}
          media={data?.media ?? []}
          isActive={isActive}
          canUpload={readiness.canAddAssets}
          beneficiaries={data?.beneficiaries ?? []}
        />
      </div>
    </div>
  );
};

export default FilesPage;
