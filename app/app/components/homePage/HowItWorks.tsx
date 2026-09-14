"use client";

import { AsciiArt } from "@/app/components/fx/AsciiArt";
import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";
import { SquigglyText } from "@/app/components/fx/SquigglyText";
import { SectionHead } from "./SectionHead";
import { paintKey, paintQuorum, paintSealedDocs } from "@/app/components/fx/artwork";

const steps = [
  {
    n: "01",
    title: "Seal your will",
    body: "Upload documents, keys and messages to IPFS, name beneficiaries with their allocation splits, and set your inactivity window — all on-chain.",
    bullets: ["Encrypted files on IPFS", "Weighted beneficiary splits", "Inactivity timer you choose"],
    paint: paintSealedDocs,
  },
  {
    n: "02",
    title: "Appoint custodians",
    body: "Name trusted custodians and choose how many must agree before anything unlocks. They can only confirm your passing — never read or move your files.",
    bullets: ["M-of-N custodian quorum", "On-chain death confirmation", "Add or remove anytime"],
    paint: paintQuorum,
  },
  {
    n: "03",
    title: "Heirs inherit",
    body: "Once you have gone inactive and the quorum confirms, the will turns claimable. Each beneficiary signs to unlock the payload — no executor, no intermediary.",
    bullets: ["Contract-enforced release", "Per-beneficiary claim", "Access to sealed documents"],
    paint: paintKey,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-border">
      <SectionHead
        eyebrow="How it works"
        title="Three steps. One signature each."
        blurb="Blop replaces lawyers, paperwork and goodwill with a program that releases exactly what you sealed, to exactly who you named, exactly when your custodians confirm."
      />

      <div className="grid grid-cols-1 border-t border-border md:grid-cols-3">
        {steps.map((s) => (
          <ScrambleZone
            key={s.n}
            as="article"
            className="group border-b border-border px-5 py-10 transition-colors last:border-b-0 hover:bg-[rgba(233,229,220,0.02)] sm:px-8 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <div className="flex items-start justify-between">
              <span className="index-mono">STEP {s.n}</span>
              {/* Coarse and large beats fine and small: at 8px the block ramp
                  (░▒▓) is itself a dither pattern, and two dithers stacked
                  read as mush. Bigger cells with distinct glyphs stay crisp. */}
              <div className="w-36 text-foreground/85 transition-colors group-hover:text-accent sm:w-44">
                <AsciiArt
                  paint={s.paint}
                  cols={24}
                  rows={12}
                  ramp="ascii"
                  gain={2.4}
                  fontSize={13}
                  blur={0.2}
                  bite={5}
                  className="font-mono"
                  label={s.title}
                />
              </div>
            </div>

            <SquigglyText
              as="h3"
              rest={0.6}
              peak={5}
              className="mt-6 block text-xl tracking-tight"
            >
              <ScrambleText text={s.title} trigger="zone" speed={30} />
            </SquigglyText>

            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              <ScrambleText text={s.body} trigger="zone" speed={190} />
            </p>

            <ul className="mt-6 border-t border-border">
              {s.bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-center gap-2.5 border-b border-border py-2.5 text-[13px] text-muted last:border-b-0"
                >
                  <span className="text-accent">+</span>
                  <ScrambleText text={b} trigger="zone" speed={62} />
                </li>
              ))}
            </ul>
          </ScrambleZone>
        ))}
      </div>
    </section>
  );
}
