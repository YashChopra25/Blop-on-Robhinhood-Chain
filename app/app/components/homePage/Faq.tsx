"use client";

import { useState } from "react";
import { ScrambleText } from "@/app/components/fx/ScrambleText";
import { SectionHead } from "./SectionHead";

const faqs = [
  {
    q: "Does Blop hold my crypto?",
    a: "Only what you deliberately escrow. The contract holds no ETH at all, and no token unless you call Escrow on it — those ERC-20 deposits it does custody, and releases them to your heirs in the splits you set. Everything else it merely records: the content hashes (IPFS CIDs) of the files you seal, your beneficiaries and their allocations, and your custodians.",
  },
  {
    q: "What actually unlocks the will?",
    a: "Two gates. First, your inactivity window has to elapse — staying active keeps everything sealed. Then your custodians sign on-chain death confirmations; once the M-of-N quorum you set is reached, the will becomes Claimable and each beneficiary can claim.",
  },
  {
    q: "Who are custodians, and what can they see?",
    a: "Custodians are wallets you trust to confirm your passing. Their only power is to approve a death confirmation — they can't read your files, change beneficiaries, or move anything. You choose how many must agree (the min_approvals quorum) and can add or remove them anytime the will is active.",
  },
  {
    q: "Can I update beneficiaries and documents later?",
    a: "Yes. While the will is Active, you can add, remove, or reweight beneficiaries, add or remove media references, and swap custodians — each a single signed transaction. Once a quorum confirms death, the will freezes into its Claimable state.",
  },
  {
    q: "What can I store, and is it private?",
    a: "Any file type — documents, keys, images, video — pinned to IPFS. Encrypt it client-side before uploading; the chain only ever sees the CID and a short media-type tag, never the contents.",
  },
  {
    q: "What does it cost?",
    a: "Just gas. Robinhood Chain is an Ethereum L2, so each transaction — creating the will, adding an heir or custodian, sealing a document, claiming — costs a fraction of a cent. There is no rent or per-record deposit to recover, and the protocol itself takes no fee.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-b border-border">
      <SectionHead eyebrow="FAQ" title="The questions everyone asks first." />

      <ul className="border-t border-border">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <li key={f.q} className="border-b border-border">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="group flex w-full items-baseline gap-5 px-5 py-5 text-left transition-colors hover:bg-[rgba(233,229,220,0.025)] sm:px-8"
              >
                <span className="index-mono shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[15px] font-medium">
                  <ScrambleText text={f.q} speed={52} />
                </span>
                <span
                  className={`shrink-0 font-mono text-sm transition-colors ${
                    isOpen ? "text-accent" : "text-muted group-hover:text-foreground"
                  }`}
                  aria-hidden
                >
                  {isOpen ? "[−]" : "[+]"}
                </span>
              </button>
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="max-w-3xl px-5 pb-6 pl-5 text-sm leading-relaxed text-muted sm:px-8 sm:pl-[76px]">
                    {f.a}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
