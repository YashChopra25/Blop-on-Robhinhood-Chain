"use client";

import { FC } from "react";
import { InheritanceList } from "@/app/components/dashboard/inheritance/InheritanceList";

const InheritancePage: FC = () => {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-6 glass-strong max-w-4xl mx-auto w-full animate-fade-in">
      <InheritanceList />
    </div>
  );
};

export default InheritancePage;
