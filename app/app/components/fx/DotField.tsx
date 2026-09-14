"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A halftone dot field driven by an arbitrary paint callback.
 *
 * `paint` draws an opaque silhouette into an offscreen buffer; every grid cell
 * whose sample is lit becomes a dot with a home coordinate. The pointer pushes
 * dots off their homes and a spring pulls them back, so the artwork blows
 * apart under the cursor and reassembles the moment it leaves. There is no
 * "broken" resting state — the physics only has one fixed point, the original
 * image.
 *
 * Everything imperative lives in one effect that owns the canvas for as long
 * as it is mounted; the component body only wires pointer events to it. The
 * loop parks itself once every dot is home and the pointer is gone, so an idle
 * field costs nothing.
 */

export type PaintFn = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => void;

interface Dot {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Per-dot brightness, so the field reads as dithered rather than printed. */
  a: number;
}

interface DotFieldProps {
  paint: PaintFn;
  /** height / width of the drawing box. */
  aspect: number;
  /** Grid pitch in CSS pixels. Smaller is denser and costlier. */
  cell?: number;
  /** Dot side length as a fraction of the pitch. */
  fill?: number;
  color?: string;
  /** Accent applied to dots the pointer is currently disturbing. */
  hotColor?: string;
  /** Radius of the pointer's influence, in CSS pixels. */
  radius?: number;
  /** How hard the pointer shoves. */
  force?: number;
  className?: string;
  ariaLabel?: string;
}

const SPRING = 0.055;
const DAMP = 0.86;
const NOOP = () => {};

export function DotField({
  paint,
  aspect,
  cell = 6,
  fill = 0.62,
  color = "#e9e5dc",
  hotColor = "#d99a3a",
  radius = 130,
  force = 34,
  className,
  ariaLabel,
}: DotFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moveRef = useRef<(x: number, y: number) => void>(NOOP);
  const leaveRef = useRef<() => void>(NOOP);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const parent = canvas?.parentElement;
    if (!canvas || !ctx || !parent) return;

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame: number | null = null;
    const pointer = { x: 0, y: 0, on: false };
    // The shatter is large-amplitude motion across the whole artwork, so it is
    // suppressed outright rather than merely slowed. The dots still render.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** Re-sample the silhouette into a fresh set of dot homes. */
    const build = () => {
      if (width <= 0 || height <= 0) return;
      const buf = document.createElement("canvas");
      buf.width = Math.max(1, Math.round(width));
      buf.height = Math.max(1, Math.round(height));
      const bctx = buf.getContext("2d", { willReadFrequently: true });
      if (!bctx) return;

      paint(bctx, buf.width, buf.height);
      const { data } = bctx.getImageData(0, 0, buf.width, buf.height);

      const next: Dot[] = [];
      const half = cell / 2;
      for (let y = half; y < height; y += cell) {
        for (let x = half; x < width; x += cell) {
          const idx = ((y | 0) * buf.width + (x | 0)) * 4;
          const alpha = data[idx + 3];
          if (alpha < 90) continue;
          // Luminance of the sample rides the dot's opacity, which is what
          // turns a shaded drawing into a dither instead of a stencil.
          const lum =
            (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) /
            255;
          next.push({
            hx: x,
            hy: y,
            x,
            y,
            vx: 0,
            vy: 0,
            a: Math.min(1, 0.32 + lum * 0.75) * (alpha / 255),
          });
        }
      }
      dots = next;
    };

    /** One physics + paint pass. Returns whether anything is still in motion. */
    const draw = (): boolean => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const side = cell * fill;
      const r2 = radius * radius;
      let moving = false;

      for (const d of dots) {
        if (pointer.on) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < r2) {
            const dist = Math.sqrt(dist2) || 0.001;
            // Falls off toward the edge of the influence circle so the blast
            // has a soft rim rather than a visible cut line.
            const falloff = 1 - dist / radius;
            const push = (force * falloff * falloff) / dist;
            d.vx += dx * push * 0.06;
            d.vy += dy * push * 0.06;
          }
        }

        d.vx += (d.hx - d.x) * SPRING;
        d.vy += (d.hy - d.y) * SPRING;
        d.vx *= DAMP;
        d.vy *= DAMP;
        d.x += d.vx;
        d.y += d.vy;

        const offset = Math.abs(d.x - d.hx) + Math.abs(d.y - d.hy);
        if (offset > 0.12 || Math.abs(d.vx) + Math.abs(d.vy) > 0.06) moving = true;

        ctx.globalAlpha = d.a;
        // Displaced dots take the accent, which reads as the artwork being
        // actively disturbed rather than merely animated.
        ctx.fillStyle = offset > 3 ? hotColor : color;
        ctx.fillRect(d.x - side / 2, d.y - side / 2, side, side);
      }

      ctx.globalAlpha = 1;
      return moving || pointer.on;
    };

    const tick = () => {
      frame = draw() ? requestAnimationFrame(tick) : null;
    };
    const wake = () => {
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const w = parent.clientWidth;
      if (w <= 0) return;
      width = w;
      height = Math.round(w * aspect);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      build();
      draw();
    };

    resize();
    // Web fonts change glyph metrics, so a text-derived field must be sampled
    // again once the face it was measured against has actually loaded.
    let live = true;
    document.fonts.ready.then(() => {
      if (live) resize();
    });

    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    moveRef.current = (x, y) => {
      if (reduced) return;
      pointer.x = x;
      pointer.y = y;
      pointer.on = true;
      wake();
    };
    leaveRef.current = () => {
      pointer.on = false;
      wake();
    };

    return () => {
      live = false;
      ro.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      moveRef.current = NOOP;
      leaveRef.current = NOOP;
    };
  }, [paint, aspect, cell, fill, color, hotColor, radius, force]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      moveRef.current(e.clientX - rect.left, e.clientY - rect.top);
    },
    []
  );

  const onPointerLeave = useCallback(() => leaveRef.current(), []);

  return (
    <canvas
      ref={canvasRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      className={className}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
    />
  );
}
