"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A single wall clock shared by every countdown in the app.
 *
 * One interval drives all subscribers, and it only runs while something is
 * actually watching. Exposed through `useSyncExternalStore` rather than
 * `useState` + `useEffect` because a clock is external state: React reads the
 * current second during render instead of a component pushing it in after
 * mount, which is also what keeps the server render free of a "now".
 */
let currentSecs = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  const next = Math.floor(Date.now() / 1000);
  if (next === currentSecs) return;
  currentSecs = next;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (!timer) {
    // Refresh immediately: `currentSecs` may be stale from a previous run in
    // which every subscriber had unmounted and the timer was cleared.
    currentSecs = Math.floor(Date.now() / 1000);
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The current time in unix **seconds**, or `null` on the server and on the
 * first client paint — a countdown has no meaningful server value, and
 * rendering one would mismatch hydration. Callers render a placeholder while
 * it is null.
 *
 * `intervalMs` coarsens the result rather than adding a timer: `useNow(60_000)`
 * returns a value that only changes once a minute, so it is safe as a
 * dependency of a `useMemo` that re-sorts a list.
 */
export function useNow(intervalMs = 1000): number | null {
  const stepSecs = Math.max(1, Math.round(intervalMs / 1000));

  const getSnapshot = useCallback(() => {
    if (!currentSecs) return null;
    return stepSecs === 1
      ? currentSecs
      : Math.floor(currentSecs / stepSecs) * stepSecs;
  }, [stepSecs]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
