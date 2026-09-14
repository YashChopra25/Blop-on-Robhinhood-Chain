"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FC } from "react";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  ShieldCheck,
  Coins,
  Gift,
  Key,
  Settings,
} from "lucide-react";
import { Logo } from "@/app/components/homePage/Logo";
import { useDashboard } from "@/hooks/useDashboard";
import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";

const links = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/beneficiaries", label: "Beneficiaries", icon: Users },
  { href: "/dashboard/files", label: "Files & Documents", icon: FolderOpen },
  { href: "/dashboard/custodians", label: "Custodians", icon: ShieldCheck },
  { href: "/dashboard/assets", label: "Token Escrow", icon: Coins },
  { href: "/dashboard/inheritance", label: "My Inheritance", icon: Gift },
  { href: "/dashboard/intervene", label: "Intervene & Claim", icon: Key },
  { href: "/dashboard/settings", label: "Will Settings", icon: Settings },
];

interface DashboardSidebarProps {
  onClose?: () => void;
}

export const DashboardSidebar: FC<DashboardSidebarProps> = ({ onClose }) => {
  const pathname = usePathname();
  const { data } = useDashboard();
  const will = data?.will;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center border-b border-border px-5">
        <ScrambleZone>
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
        </ScrambleZone>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {links.map((link, i) => {
          const Icon = link.icon;
          // Keep the parent link lit on nested routes (e.g. /dashboard/inheritance/<owner>).
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              aria-current={isActive ? "page" : undefined}
              className={`group flex items-center gap-3 border-l-2 px-5 py-2.5 text-[13px] transition-colors ${
                isActive
                  ? "border-accent bg-[rgba(233,229,220,0.04)] text-foreground"
                  : "border-transparent text-muted hover:bg-[rgba(233,229,220,0.02)] hover:text-foreground"
              }`}
            >
              <span className="index-mono w-5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon
                className={`size-3.5 shrink-0 ${
                  isActive ? "text-accent" : "text-faint group-hover:text-muted"
                }`}
              />
              <ScrambleText text={link.label} speed={44} />
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center justify-between label-mono">
          <span>Vault status</span>
          <span className="text-foreground">{will ? "initialized" : "empty"}</span>
        </div>
        {will && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-neon" />
            <span className="font-mono text-[11px] capitalize text-neon">
              {Object.keys(will.status)[0]} will
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
