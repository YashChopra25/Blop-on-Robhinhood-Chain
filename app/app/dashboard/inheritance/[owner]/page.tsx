"use client";

import { FC, use } from "react";
import { InheritanceDetail } from "@/app/components/dashboard/inheritance/InheritanceDetail";

interface InheritanceDetailPageProps {
  params: Promise<{ owner: string }>;
}

const InheritanceDetailPage: FC<InheritanceDetailPageProps> = ({ params }) => {
  const { owner } = use(params);

  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-6 glass-strong max-w-4xl mx-auto w-full animate-fade-in">
      <InheritanceDetail ownerStr={owner} />
    </div>
  );
};

export default InheritanceDetailPage;
