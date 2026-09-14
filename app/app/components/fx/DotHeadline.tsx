"use client";

import { useCallback } from "react";
import { DotField } from "./DotField";

/**
 * A headline rendered as a dot matrix instead of as type.
 *
 * The words are drawn once into an offscreen buffer and sampled onto a grid,
 * so the result is a field of dots the pointer can knock out of alignment —
 * and which springs back to the exact glyph shapes when the pointer leaves.
 * The real text stays in the DOM behind it for screen readers, search, and
 * selection.
 */

/** Rough advance of a bold grotesk glyph as a fraction of its size. Used only
 *  to guess the box; the paint step then fits the type precisely inside it. */
const ADVANCE = 0.54;

interface DotHeadlineProps {
  lines: string[];
  className?: string;
  /** Vertical pitch as a multiple of the font size. */
  leading?: number;
  cell?: number;
  weight?: number;
  color?: string;
  hotColor?: string;
}

export function DotHeadline({
  lines,
  className,
  leading = 1.04,
  cell = 5,
  weight = 700,
  color = "#e9e5dc",
  hotColor = "#d99a3a",
}: DotHeadlineProps) {
  const widest = lines.reduce((max, l) => Math.max(max, l.length), 1);
  const aspect = (lines.length * leading) / (widest * ADVANCE);

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const family =
        getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

      // Binary-free fit: start from the box estimate, then shrink until the
      // longest line actually measures inside the width.
      let size = h / (lines.length * leading);
      ctx.font = `${weight} ${size}px ${family}`;
      let longest = 0;
      for (const line of lines) {
        longest = Math.max(longest, ctx.measureText(line).width);
      }
      if (longest > w) size *= w / longest;

      ctx.font = `${weight} ${size}px ${family}`;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "alphabetic";

      const step = size * leading;
      // Centre the block vertically; `0.78` approximates the cap-height offset
      // from the baseline for a grotesk.
      const top = (h - step * lines.length) / 2;
      lines.forEach((line, i) => {
        ctx.fillText(line, 0, top + step * i + size * 0.78);
      });
    },
    [lines, leading, weight]
  );

  return (
    <div className={className}>
      <h1 className="sr-only">{lines.join(" ")}</h1>
      <div aria-hidden="true" className="relative w-full">
        <DotField
          paint={paint}
          aspect={aspect}
          cell={cell}
          fill={0.68}
          color={color}
          hotColor={hotColor}
          radius={150}
          force={46}
          className="block w-full cursor-crosshair"
        />
      </div>
    </div>
  );
}
