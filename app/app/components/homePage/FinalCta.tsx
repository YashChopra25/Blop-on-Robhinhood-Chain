"use client";

import Link from "next/link";
import { DotHeadline } from "@/app/components/fx/DotHeadline";
import { ScrambleText } from "@/app/components/fx/ScrambleText";

export function FinalCta() {
  return (
    <section id="cta" className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 subtle-grid" />

      <div className="relative flex flex-col items-center px-5 py-24 text-center sm:px-8">
        <p className="label-mono text-accent">
          <ScrambleText text="Final step" trigger="view" speed={40} />
        </p>

        <DotHeadline
          lines={["Secure your legacy", "in minutes."]}
          className="mt-8 w-full max-w-3xl"
          cell={4}
        />

        <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-muted">
          <ScrambleText
            text="Connect a wallet, seal your documents, name your heirs and custodians. Stay active and nothing moves — go silent and your will does exactly what you wrote."
            speed={180}
          />
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center px-6 text-sm btn-primary"
          >
            <ScrambleText text="Launch app" speed={48} noiseClassName="opacity-50" />
            <span className="ml-2">↗</span>
          </Link>
          <Link
            href="#demo"
            className="inline-flex h-11 items-center px-6 text-sm btn-ghost"
          >
            <ScrambleText text="View demo" speed={48} />
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 label-mono">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-neon" />
            Devnet open · mainnet Q3
          </span>
          <span className="text-faint">/</span>
          <span>Audits: OtterSec, Neodyme</span>
          <span className="text-faint">/</span>
          <span>Source on Blockscout</span>
        </div>
      </div>
    </section>
  );
}
