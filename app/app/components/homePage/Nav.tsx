"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#demo", label: "Demo" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-5 sm:px-8">
        <ScrambleZone className="shrink-0">
          <Link href="/" aria-label="Blop home" className="flex items-center">
            <Logo />
          </Link>
        </ScrambleZone>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[12px] text-muted transition-colors hover:text-foreground"
            >
              <ScrambleText text={l.label} speed={40} />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <a
            href="#demo"
            className="hidden sm:inline-flex h-9 items-center border border-border-strong px-3.5 text-[12px] text-muted transition-colors hover:border-foreground hover:text-foreground"
          >
            <ScrambleText text="Try demo" speed={44} />
          </a>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center px-4 text-[12px] btn-primary"
          >
            <ScrambleText text="Launch app" speed={44} noiseClassName="opacity-50" />
          </Link>
        </div>
      </div>
    </header>
  );
}
