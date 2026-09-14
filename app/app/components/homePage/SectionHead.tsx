"use client";

import { ScrambleText } from "@/app/components/fx/ScrambleText";
import { SquigglyText } from "@/app/components/fx/SquigglyText";

/**
 * The standard band header: an amber mono eyebrow, a squiggly display line,
 * and optional blurb. Every section opens the same way so the page reads as
 * one document rather than a stack of cards.
 */
export function SectionHead({
  eyebrow,
  title,
  blurb,
  aside,
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
  aside?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-2xl">
        <p className="label-mono text-accent">
          <ScrambleText text={eyebrow} trigger="view" speed={40} />
        </p>
        <SquigglyText
          as="h2"
          rest={0.7}
          peak={6}
          className="mt-4 block text-3xl tracking-tight sm:text-[38px]"
        >
          <ScrambleText text={title} trigger="view" speed={72} />
        </SquigglyText>
        {blurb ? (
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            <ScrambleText text={blurb} speed={200} />
          </p>
        ) : null}
      </div>
      {aside ? (
        <p className="max-w-xs text-sm text-muted">
          <ScrambleText text={aside} speed={150} />
        </p>
      ) : null}
    </div>
  );
}
