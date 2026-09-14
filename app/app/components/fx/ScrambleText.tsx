"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";

/**
 * Text that shreds itself into glyph noise and then rebuilds, left to right.
 *
 * The whole string is corrupted the instant the effect fires; a reveal head
 * then sweeps across it restoring the real characters. Nothing is left in a
 * broken state — the run always terminates on the original text, so a pointer
 * that leaves mid-flight still finds the label intact.
 *
 * Frames are written straight to two text nodes rather than through state. A
 * paragraph-length label is ~200 characters at 60fps; routing that through
 * React would re-render the subtree on every frame for no benefit, since the
 * only thing changing is the text content.
 */

const GLYPHS = "!<>-_\\/[]{}=+*^?#%$&01↑↓·";

/** Spaces stay put so word widths — and therefore line wrapping — never move. */
function corrupt(source: string, from: number): string {
  let out = "";
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    out += ch === " " || ch === "\n" ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}

/* --- Zone ------------------------------------------------------------------
   Hovering a card should shred every label inside it at once, not just the one
   under the cursor. A zone broadcasts a token; descendants with
   `trigger="zone"` re-run whenever it changes. */

const ScrambleZoneContext = createContext<number>(0);

export function ScrambleZone({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  const [token, setToken] = useState(0);
  const bump = useCallback(() => setToken((t) => t + 1), []);

  return (
    <ScrambleZoneContext.Provider value={token}>
      <Tag className={className} onMouseEnter={bump} onFocusCapture={bump}>
        {children}
      </Tag>
    </ScrambleZoneContext.Provider>
  );
}

type Trigger = "hover" | "view" | "mount" | "zone";

interface ScrambleTextProps {
  text: string;
  /** What starts a run. `view` fires once, when the text scrolls into frame. */
  trigger?: Trigger;
  /** Characters restored per second. */
  speed?: number;
  /** Seconds of pure noise before the reveal head starts moving. */
  hold?: number;
  as?: ElementType;
  className?: string;
  /** Class applied to the not-yet-restored tail. */
  noiseClassName?: string;
}

const NOOP = () => {};

export function ScrambleText({
  text,
  trigger = "hover",
  speed = 46,
  hold = 0.08,
  as: Tag = "span",
  className,
  noiseClassName = "text-faint",
}: ScrambleTextProps) {
  const hostRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const runRef = useRef<() => void>(NOOP);
  const zoneToken = useContext(ScrambleZoneContext);

  // Owns the animation for the current string. Re-running on a `text` change
  // also resets the nodes, so a live value (a countdown, a fetched address)
  // never finishes a run against characters that are no longer there.
  useEffect(() => {
    const head = headRef.current;
    const tail = tailRef.current;
    if (!head || !tail) return;

    head.textContent = text;
    tail.textContent = "";

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let frame: number | null = null;
    const total = text.length;

    runRef.current = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      const started = performance.now();

      const step = (now: number) => {
        const elapsed = (now - started) / 1000 - hold;
        const cut = Math.min(Math.floor(Math.max(elapsed, 0) * speed), total);
        head.textContent = text.slice(0, cut);
        tail.textContent = cut < total ? corrupt(text, cut) : "";
        frame = cut < total ? requestAnimationFrame(step) : null;
      };

      head.textContent = "";
      tail.textContent = corrupt(text, 0);
      frame = requestAnimationFrame(step);
    };

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      runRef.current = NOOP;
    };
  }, [text, speed, hold]);

  useEffect(() => {
    if (trigger === "mount") runRef.current();
  }, [trigger, text]);

  // `zoneToken` starts at 0 and only a real hover increments it, so the guard
  // keeps the initial render quiet.
  useEffect(() => {
    if (trigger === "zone" && zoneToken > 0) runRef.current();
  }, [trigger, zoneToken]);

  useEffect(() => {
    if (trigger !== "view") return;
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            runRef.current();
            io.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [trigger]);

  const fire = useCallback(() => runRef.current(), []);
  const hoverProps = trigger === "hover" ? { onMouseEnter: fire, onFocus: fire } : {};

  return (
    <Tag ref={hostRef} className={className} {...hoverProps}>
      {/* The stable string is what assistive tech and copy/paste see; the
          animated nodes beside it are decoration. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <span ref={headRef}>{text}</span>
        <span ref={tailRef} className={noiseClassName} />
      </span>
    </Tag>
  );
}
