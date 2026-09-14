import Link from "next/link";
import { DitherShader } from "@/app/components/fx/DitherShader";
import { DotHeadline } from "@/app/components/fx/DotHeadline";
import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";
import { SquigglyText } from "@/app/components/fx/SquigglyText";
import { CHAIN } from "@/lib/evm/config";

const stats = [
  { k: "Custody", v: "None" },
  { k: "Storage", v: "IPFS + chain" },
  { k: "Release", v: "M-of-N" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 subtle-grid" />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_0.9fr]">
        <div className="px-5 sm:px-8 pt-16 pb-14 lg:py-24">
          <div className="flex items-center gap-2 label-mono">
            <span className="size-1.5 rounded-full bg-neon" />
            <ScrambleText
              text={`${CHAIN.name} · audit in progress`}
              trigger="view"
              speed={54}
            />
          </div>

          {/* The headline is a dot field: run a cursor through it and the
              letters blow apart, then fall back into place. */}
          <DotHeadline
            lines={["Silence is", "the trigger."]}
            className="mt-6 max-w-[620px]"
            cell={5}
          />

          <SquigglyText
            as="p"
            rest={0.5}
            peak={4}
            className="mt-8 max-w-lg text-[15px] leading-relaxed text-muted"
          >
            <ScrambleText
              text="Seal your documents, keys and final messages on IPFS. Name your heirs, appoint custodians. Go quiet for long enough, and the program hands over exactly what you sealed — to exactly who you named."
              speed={130}
            />
          </SquigglyText>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center px-5 text-sm btn-primary"
            >
              <ScrambleText text="Create your will" speed={50} noiseClassName="opacity-50" />
              <span className="ml-2">↗</span>
            </Link>
            <Link
              href="#demo"
              className="inline-flex h-11 items-center px-5 text-sm btn-ghost"
            >
              <ScrambleText text="Run the simulation" speed={50} />
            </Link>
          </div>

          <dl className="mt-14 grid max-w-lg grid-cols-3 border-t border-border">
            {stats.map((s) => (
              <ScrambleZone
                key={s.k}
                as="div"
                className="border-r border-border py-4 pr-4 last:border-r-0"
              >
                <dt className="label-mono">
                  <ScrambleText text={s.k} trigger="zone" speed={30} />
                </dt>
                <dd className="mt-2 font-mono text-sm text-foreground">
                  <ScrambleText text={s.v} trigger="zone" speed={30} />
                </dd>
              </ScrambleZone>
            ))}
          </dl>
        </div>

        {/* Bayer-dithered monument. The pointer detonates the dot field; it
            reassembles the moment the cursor leaves. */}
        <div className="relative min-h-[340px] border-t border-border lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="absolute inset-0">
            <DitherShader
              className="block h-full w-full cursor-crosshair"
              pixel={4}
              ariaLabel="A dithered monument that scatters under the cursor"
            />
          </div>
          <span className="pointer-events-none absolute bottom-4 right-5 label-mono">
            fig. 01 — the vault
          </span>
        </div>
      </div>
    </section>
  );
}
