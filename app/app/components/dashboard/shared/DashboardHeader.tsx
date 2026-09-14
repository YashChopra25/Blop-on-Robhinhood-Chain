"use client";

import { FC } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { CHAIN } from "@/lib/evm/config";
import { ScrambleText } from "@/app/components/fx/ScrambleText";
import { ConnectWalletButton } from "./ConnectWalletButton";

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

const titles: Record<string, string> = {
  "/dashboard/overview": "Dashboard Overview",
  "/dashboard/beneficiaries": "Manage Heirs & Shares",
  "/dashboard/files": "Secure Documents Vault",
  "/dashboard/custodians": "Will Custodians",
  "/dashboard/assets": "Asset Distribution",
  "/dashboard/inheritance": "My Inheritance",
  "/dashboard/intervene": "Intervention & Claim Console",
  "/dashboard/settings": "Vault Configuration",
};

/** Falls back to the longest matching parent so nested routes keep a title. */
function resolveTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  const parent = Object.keys(titles)
    .filter((p) => pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? titles[parent] : "Dashboard";
}

export const DashboardHeader: FC<DashboardHeaderProps> = ({ onMenuClick }) => {
  const pathname = usePathname();
  const pageTitle = resolveTitle(pathname);

  return (
    <header className="z-30 flex h-14 items-center justify-between border-b border-border bg-background px-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="-ml-2 p-2 text-muted transition-colors hover:text-foreground lg:hidden"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="size-4" />
        </button>
        <h1 className="hidden font-mono text-[12px] uppercase tracking-[0.14em] text-foreground sm:block">
          <ScrambleText text={pageTitle} speed={44} />
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-2 label-mono md:inline-flex">
          <span className="size-1.5 rounded-full bg-accent" />
          {CHAIN.name}
        </span>
        <ConnectWalletButton />
      </div>
    </header>
  );
};
