"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  RAMPS,
  measureCharWidth,
  noiseChar,
  sampleToAscii,
  type PaintFn,
  type RampName,
} from "./ascii";

/**
 * ASCII art that comes apart under the pointer and knits itself back together.
 *
 * Art arrives either literally (`art`) or as a canvas drawing that gets
 * sampled down to a character grid (`paint`). Either way each cell carries a
 * heal deadline: corrupting a cell just pushes its deadline into the future,
 * and the frame loop restores anything whose deadline has passed. Because the
 * only thing an interaction can do is postpone the repair, the art cannot get
 * stuck in a damaged state — walk away mid-shred and it finishes rebuilding on
 * its own.
 *
 * Entering the art shreds all of it at once and heals in a left-to-right wipe;
 * moving across it keeps re-breaking whatever is under the cursor.
 */

interface AsciiArtProps {
  /** Pre-drawn art, one string per row. Rows are padded to a rectangle. */
  art?: string[];
  /** Procedural alternative: draw a silhouette, get it back as characters. */
  paint?: PaintFn;
  /** Grid width for `paint` mode. Ignored when `art` is given. */
  cols?: number;
  /** Grid height for `paint` mode. Ignored when `art` is given. */
  rows?: number;
  ramp?: RampName;
  /** Luminance boost applied before the ramp lookup. See `sampleToAscii`. */
  gain?: number;
  fontSize?: number;
  /** Line box as a multiple of font size. Under 1 packs the rows together. */
  lineHeight?: number;
  className?: string;
  /**
   * Soft-focus amount, 0-1. Scaled against the font size rather than set in
   * pixels, so the haze stays proportional to the character cell whatever size
   * the art is rendered at. Around 0.2 reads as atmosphere while leaving every
   * glyph legible.
   */
  blur?: number;
  /** Radius of the pointer's destruction, in characters. */
  bite?: number;
  /** Milliseconds the left-to-right heal wipe takes across the full width. */
  healSweep?: number;
  /** Description for assistive tech; without one the art is decorative. */
  label?: string;
}

/** Frames between glyph re-rolls. Every frame reads as static, not decay. */
const RE_ROLL_EVERY = 2;
const NOOP = () => {};

export function AsciiArt({
  art,
  paint,
  cols = 72,
  rows = 26,
  ramp = "ascii",
  gain = 1,
  fontSize = 11,
  lineHeight = 1.02,
  className,
  blur = 0,
  bite = 7,
  healSweep = 520,
  label,
}: AsciiArtProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const enterRef = useRef<() => void>(NOOP);
  const moveRef = useRef<(xRatio: number, yRatio: number) => void>(NOOP);
  const leaveRef = useRef<() => void>(NOOP);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;

    let grid: string[] = [];
    let width = 0;
    let height = 0;
    let heal = new Float64Array(0);
    let glyphs: string[] = [];
    let frame: number | null = null;
    let frames = 0;
    let pointerOn = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** Compose the current character state into the element in one write. */
    const render = (): boolean => {
      if (grid.length === 0) return false;
      const now = performance.now();
      const reroll = frames++ % RE_ROLL_EVERY === 0;
      let out = "";
      let damaged = false;

      for (let r = 0; r < height; r++) {
        const source = grid[r];
        let line = "";
        for (let c = 0; c < width; c++) {
          const i = r * width + c;
          const original = source[c] ?? " ";
          if (heal[i] > now) {
            damaged = true;
            // Spaces stay spaces: filling the negative space would turn the
            // silhouette into a solid block and lose the drawing entirely.
            if (original === " ") {
              line += " ";
            } else {
              if (reroll || !glyphs[i]) glyphs[i] = noiseChar();
              line += glyphs[i];
            }
          } else {
            line += original;
          }
        }
        out += r === 0 ? line : "\n" + line;
      }

      pre.textContent = out;
      return damaged || pointerOn;
    };

    const tick = () => {
      frame = render() ? requestAnimationFrame(tick) : null;
    };
    const wake = () => {
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    const build = () => {
      if (art && art.length > 0) {
        width = art.reduce((max, line) => Math.max(max, line.length), 0);
        grid = art.map((line) => line.padEnd(width, " "));
      } else if (paint) {
        const family = getComputedStyle(pre).fontFamily || "monospace";
        const charW = measureCharWidth(`${fontSize}px ${family}`);
        const charH = fontSize * lineHeight;
        // Fit the requested grid to the container when there is one, so the
        // art scales with the layout instead of overflowing it.
        const available = pre.parentElement?.clientWidth ?? 0;
        width =
          available > 0 ? Math.min(cols, Math.floor(available / charW)) : cols;
        grid = sampleToAscii(
          paint,
          width,
          Math.max(4, Math.round((rows * width) / cols)),
          RAMPS[ramp],
          charH / charW,
          gain
        );
      } else {
        return;
      }

      height = grid.length;
      heal = new Float64Array(width * height);
      glyphs = new Array(width * height).fill("");
      render();
    };

    build();
    // Character metrics depend on the loaded monospace face.
    let live = true;
    document.fonts.ready.then(() => {
      if (live) build();
    });

    const parent = pre.parentElement;
    const ro = parent && paint ? new ResizeObserver(build) : null;
    if (parent && ro) ro.observe(parent);

    enterRef.current = () => {
      if (reduced) return;
      const now = performance.now();
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          heal[r * width + c] =
            now + (c / Math.max(1, width)) * healSweep + Math.random() * 140;
        }
      }
      wake();
    };

    moveRef.current = (xRatio, yRatio) => {
      if (reduced || width === 0 || height === 0) return;
      pointerOn = true;
      const col = Math.floor(xRatio * width);
      const row = Math.floor(yRatio * height);
      const now = performance.now();
      const r2 = bite * bite;

      for (let y = Math.max(0, row - bite); y <= Math.min(height - 1, row + bite); y++) {
        for (let x = Math.max(0, col - bite); x <= Math.min(width - 1, col + bite); x++) {
          const dx = x - col;
          // Character cells are about twice as tall as they are wide, so the
          // vertical term is doubled to keep the bite round on screen.
          const dy = (y - row) * 2;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          // Thins out toward the rim rather than cutting a hard disc.
          if (Math.random() > 1 - d2 / r2) continue;
          const i = y * width + x;
          const until = now + 130 + Math.random() * 280;
          if (until > heal[i]) heal[i] = until;
        }
      }
      wake();
    };

    leaveRef.current = () => {
      pointerOn = false;
      wake();
    };

    return () => {
      live = false;
      ro?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      enterRef.current = NOOP;
      moveRef.current = NOOP;
      leaveRef.current = NOOP;
    };
  }, [art, paint, cols, rows, ramp, gain, fontSize, lineHeight, bite, healSweep]);

  const onPointerEnter = useCallback(() => enterRef.current(), []);
  const onPointerLeave = useCallback(() => leaveRef.current(), []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLPreElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      moveRef.current(
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height
      );
    },
    []
  );

  return (
    <pre
      ref={preRef}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      className={className}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: `${fontSize * lineHeight}px`,
        letterSpacing: 0,
        whiteSpace: "pre",
        margin: 0,
        userSelect: "none",
        // A quarter of the cell is the point where glyphs start bleeding into
        // their neighbours, so that is what `blur: 1` means here.
        filter: blur > 0 ? `blur(${(blur * fontSize * 0.25).toFixed(2)}px)` : undefined,
      }}
      role={label ? "img" : "presentation"}
      aria-label={label}
    />
  );
}
