"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ElementType,
  type ReactNode,
} from "react";

/**
 * Type that never sits perfectly still.
 *
 * An SVG turbulence + displacement pair warps the glyph outlines, and swapping
 * the noise seed on a slow cadence makes the warp crawl — the hand-drawn
 * "boil" you get from re-inking a frame. At rest the amplitude is barely a
 * pixel, so headings stay readable; hovering spikes it, then it decays back to
 * the resting squiggle on its own.
 *
 * Every instance rides one shared 12fps ticker rather than its own rAF, so a
 * page full of squiggly headings costs a handful of attribute writes per frame
 * and nothing else.
 */

type Subscriber = (frame: number) => void;

const subscribers = new Set<Subscriber>();
let timer: ReturnType<typeof setInterval> | null = null;
let frameCount = 0;

function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  if (timer === null) {
    timer = setInterval(() => {
      frameCount += 1;
      for (const sub of subscribers) sub(frameCount);
    }, 1000 / 12);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

interface SquigglyTextProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Displacement in pixels when idle. Keep it under ~2 for body-size text. */
  rest?: number;
  /** Peak displacement right after the pointer arrives. */
  peak?: number;
  /** Noise scale. Higher is a tighter, more frantic wobble. */
  frequency?: number;
  /** Seconds for the spike to fall back to `rest`. */
  decay?: number;
}

export function SquigglyText({
  children,
  as: Tag = "span",
  className,
  rest = 0.9,
  peak = 7,
  frequency = 0.028,
  decay = 0.5,
}: SquigglyTextProps) {
  const rawId = useId();
  // `useId` emits colons, which are not valid in a CSS url() fragment.
  const filterId = `squiggle-${rawId.replace(/[:]/g, "")}`;

  const turbulenceRef = useRef<SVGFETurbulenceElement>(null);
  const displaceRef = useRef<SVGFEDisplacementMapElement>(null);
  const amplitudeRef = useRef(rest);
  const spikeAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      displaceRef.current?.setAttribute("scale", "0");
      return;
    }

    return subscribe((frame) => {
      const turbulence = turbulenceRef.current;
      const displace = displaceRef.current;
      if (!turbulence || !displace) return;

      // Four seeds cycled in sequence: enough variation to read as motion,
      // few enough that the browser can cache each noise tile.
      turbulence.setAttribute("seed", String(frame % 4));

      const spikeAt = spikeAtRef.current;
      if (spikeAt !== null) {
        const elapsed = (performance.now() - spikeAt) / 1000;
        const falling = Math.exp(-elapsed / decay);
        amplitudeRef.current = rest + (peak - rest) * falling;
        if (falling < 0.02) {
          amplitudeRef.current = rest;
          spikeAtRef.current = null;
        }
      }

      displace.setAttribute("scale", amplitudeRef.current.toFixed(2));
    });
  }, [rest, peak, decay]);

  const spike = useCallback(() => {
    spikeAtRef.current = performance.now();
  }, []);

  return (
    <>
      <svg
        aria-hidden="true"
        focusable="false"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <filter
          id={filterId}
          // The displaced outline pushes past the glyph box, so the filter
          // region is widened or the wobble gets sliced off at the edges.
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            ref={turbulenceRef}
            type="fractalNoise"
            baseFrequency={frequency}
            numOctaves={2}
            seed={0}
            result="noise"
          />
          <feDisplacementMap
            ref={displaceRef}
            in="SourceGraphic"
            in2="noise"
            scale={rest}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <Tag
        className={className}
        style={{ filter: `url(#${filterId})` }}
        onMouseEnter={spike}
        onFocusCapture={spike}
      >
        {children}
      </Tag>
    </>
  );
}
