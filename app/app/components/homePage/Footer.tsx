"use client";

import { AsciiArt } from "@/app/components/fx/AsciiArt";
import { MARK_CHAIN } from "@/app/components/fx/artwork";
import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";
import { Logo } from "./Logo";
import { CHAIN, CONTRACT_ADDRESS, explorerUrl } from "@/lib/evm/config";
import { short } from "@/lib/utils";

/** Only destinations that actually exist. Anything without a page behind it
 *  is worse than a shorter footer. */
const cols: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Demo", href: "#demo" },
      { label: "Features", href: "#features" },
      { label: "Use cases", href: "#use-cases" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Security", href: "#security" },
      { label: "FAQ", href: "#faq" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative">
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_repeat(2,1fr)]">
        <div className="border-b border-border px-5 py-10 sm:px-8 md:border-b-0 md:border-r">
          <ScrambleZone>
            <Logo />
          </ScrambleZone>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            <ScrambleText
              text="Decentralized inheritance on Robinhood Chain. No lawyers. No custody. Just signed rules and chain time."
              speed={150}
            />
          </p>
          <div className="mt-8 w-48 text-muted">
            <AsciiArt art={MARK_CHAIN} fontSize={13} blur={0.2} bite={4} className="font-mono" />
          </div>
        </div>

        {cols.map((c) => (
          <div
            key={c.title}
            className="border-b border-border px-5 py-10 last:border-b-0 sm:px-8 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <p className="label-mono">{c.title}</p>
            <ul className="mt-5 space-y-3 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-muted transition-colors hover:text-foreground"
                  >
                    <ScrambleText text={l.label} speed={40} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-start justify-between gap-3 border-t border-border px-5 py-5 label-mono sm:flex-row sm:items-center sm:px-8">
        <p>© 2026 Blop Labs — not legal advice.</p>
        <p>
          Built on {CHAIN.name} · contract{" "}
          {explorerUrl(CONTRACT_ADDRESS) ? (
            <a
              className="text-foreground hover:underline"
              href={explorerUrl(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
            >
              {short(CONTRACT_ADDRESS)}
            </a>
          ) : (
            <span className="text-foreground">{short(CONTRACT_ADDRESS)}</span>
          )}
        </p>
      </div>
    </footer>
  );
}
