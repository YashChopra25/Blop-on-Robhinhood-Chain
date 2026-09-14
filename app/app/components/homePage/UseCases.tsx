"use client";

import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";
import { SectionHead } from "./SectionHead";

const cases = [
  {
    tag: "Personal",
    title: "Key & seed-phrase escrow",
    body: "Seal encrypted recovery info on IPFS so heirs can reach your wallets and accounts — but only after custodians confirm you are gone.",
    metric: "Encrypted on IPFS",
  },
  {
    tag: "Documents",
    title: "Estate instructions",
    body: "Wills, deeds, insurance policies and asset directories, hashed on-chain and released to the people you named.",
    metric: "Any file type",
  },
  {
    tag: "Messages",
    title: "Final words",
    body: "Letters, photos and video for loved ones, delivered exactly when your custodians confirm — not a moment before.",
    metric: "Per-heir allocation",
  },
  {
    tag: "Business",
    title: "Succession & access",
    body: "Hand off credentials, runbooks and signing instructions so a company keeps running if a key person goes dark.",
    metric: "M-of-N custodians",
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="border-b border-border">
      <SectionHead
        eyebrow="Use cases"
        title="Built for anyone who can't afford to disappear."
        aside="Four patterns we see most often. The protocol is general — your rules can be too."
      />

      <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2">
        {cases.map((c) => (
          <ScrambleZone
            key={c.title}
            as="article"
            className="group border-b border-border px-5 py-8 transition-colors hover:bg-[rgba(233,229,220,0.025)] sm:px-8 sm:[&:nth-child(odd)]:border-r"
          >
            <div className="flex items-center justify-between">
              <span className="label-mono border border-border-strong px-2 py-1 text-foreground">
                {c.tag}
              </span>
              <span className="label-mono text-accent">
                <ScrambleText text={c.metric} trigger="zone" speed={40} />
              </span>
            </div>
            <h3 className="mt-6 text-xl tracking-tight">
              <ScrambleText text={c.title} trigger="zone" speed={32} />
            </h3>
            <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted">
              <ScrambleText text={c.body} trigger="zone" speed={175} />
            </p>
          </ScrambleZone>
        ))}
      </div>
    </section>
  );
}
