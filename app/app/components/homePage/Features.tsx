"use client";

import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";
import { SectionHead } from "./SectionHead";

const features = [
  {
    tag: "STORAGE",
    title: "On-chain + IPFS",
    body: "Wills, beneficiaries and custodians live in one Solidity contract; your files live on IPFS. Only the content hash is stored on-chain.",
  },
  {
    tag: "QUORUM",
    title: "Custodian quorum",
    body: "Appoint trusted custodians and require M-of-N to confirm your passing. No single party — including us — can trigger a release.",
  },
  {
    tag: "TIMER",
    title: "Inactivity dead-man's switch",
    body: "Set the window that arms your will. Custodians can only confirm once you have gone quiet; staying active keeps everything sealed.",
  },
  {
    tag: "SPLITS",
    title: "Weighted beneficiaries",
    body: "Name multiple heirs, each with an allocation in basis points. Add, remove or reweight them anytime while the will is active.",
  },
  {
    tag: "AUDIT",
    title: "Transparent & auditable",
    body: "Every will update, custodian confirmation and claim is a public transaction. Anyone — including your heirs — can verify the state.",
  },
  {
    tag: "COST",
    title: "L2-fast and cheap",
    body: "Sealing, confirming and claiming each cost a fraction of a cent on an Ethereum L2. You pay gas only for the transactions you send.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-border">
      <SectionHead
        eyebrow="Built for keeps"
        title="Everything a will should be — and nothing it shouldn't."
        aside="Six guarantees, each one enforced by the program rather than promised by us."
      />

      <div className="border-t border-border">
        {features.map((f, i) => (
          <ScrambleZone
            key={f.title}
            as="div"
            className="group grid grid-cols-1 items-baseline gap-2 border-b border-border px-5 py-6 transition-colors hover:bg-[rgba(233,229,220,0.025)] sm:grid-cols-[64px_260px_1fr] sm:gap-8 sm:px-8"
          >
            <span className="index-mono">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-[15px] font-medium tracking-tight">
              <ScrambleText text={f.title} trigger="zone" speed={34} />
            </h3>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="max-w-2xl text-sm leading-relaxed text-muted">
                <ScrambleText text={f.body} trigger="zone" speed={180} />
              </p>
              <span className="label-mono shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100">
                {f.tag}
              </span>
            </div>
          </ScrambleZone>
        ))}
      </div>
    </section>
  );
}
