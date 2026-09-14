"use client";

import { FC } from "react";
import { ActPanel } from "@/app/components/dashboard/intervene/ActPanel";

const IntervenePage: FC = () => {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-6 glass-strong max-w-4xl mx-auto w-full animate-fade-in">
      <ActPanel />
    </div>
  );
};

export default IntervenePage;
