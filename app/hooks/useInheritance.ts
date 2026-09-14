"use client";

import { useMemo } from "react";
import { useMyRoles } from "./useMyRoles";
import { useNow } from "./useNow";
import { byUrgency, summarizeInheritance } from "@/lib/inheritance";
import type { InheritanceSummary } from "@/app/types/inheritance.types";

interface UseInheritanceResult {
  items: InheritanceSummary[];
  /** Wills the program would accept a claim on right now. */
  claimableNowCount: number;
  /** Wills past quorum but still inside the owner's revocation window. */
  awaitingGraceCount: number;
  /** Open wills whose claim deadline is near, and not yet claimed. */
  closingSoonCount: number;
  /** Live wills where this heir has not published a document key yet. */
  needsKeyCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Every will that names the connected wallet as a beneficiary, described from
 * the heir's point of view and ordered with the most time-critical first.
 *
 * The clock ticks once a minute rather than once a second: nothing in the list
 * counts down in seconds, and re-sorting every row each second would be churn.
 */
export function useInheritance(): UseInheritanceResult {
  const { data, loading, error, refresh } = useMyRoles();
  const now = useNow(60_000);

  const items = useMemo(
    () =>
      data.beneficiaryWills
        .map((w) => summarizeInheritance(w, now))
        .sort(byUrgency),
    [data.beneficiaryWills, now],
  );

  const counts = useMemo(
    () => ({
      claimableNowCount: items.filter(
        (i) => i.timeline.canClaimNow && !i.will.hasClaimed,
      ).length,
      awaitingGraceCount: items.filter((i) => i.timeline.phase === "grace")
        .length,
      closingSoonCount: items.filter(
        (i) => i.timeline.closingSoon && !i.will.hasClaimed,
      ).length,
      needsKeyCount: items.filter((i) => i.needsKey).length,
    }),
    [items],
  );

  return { items, ...counts, loading, error, refresh };
}
