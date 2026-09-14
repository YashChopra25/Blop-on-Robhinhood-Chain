"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/overview");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="size-6 animate-spin rounded-full border-2 border-border-strong border-t-[var(--accent)]" />
    </div>
  );
}
