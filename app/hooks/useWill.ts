"use client";

import { useCallback, useEffect } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { useAppDispatch, useAppSelector, useAppStore } from "@/app/store/hooks";
import { loadWill } from "@/app/store/willSlice";
import { selectWillEntry } from "@/app/store/selectors";

// Re-exported so the many components that already import these types from here
// keep working; the definitions now live next to the fetcher.
export type {
  WillBundle,
  WillView,
  CustodianView,
  BeneficiaryView,
  MediaView,
  TokenVaultView,
} from "@/lib/evm/types";

/**
 * How long a loaded will is trusted before a mount will re-fetch it.
 *
 * Several components (the dashboard layout, the intervene panel, an inheritance
 * detail page) ask for the same owner's will. Without this they would each fire
 * their own multicall on mount, which matters because the public Robinhood Chain
 * RPCs are rate-limited. Mutations call `refresh()` explicitly, so freshness
 * after a write never depends on this window.
 */
const STALE_MS = 15_000;

/**
 * Loads a will (by its owner) and all of its children into the Redux store, and
 * reads it back out. Pass `null` to load nothing.
 *
 * The bundle lives in `state.will.byOwner[owner]`, so every caller asking for
 * the same owner shares one copy and one fetch. `refresh()` re-reads it — call
 * it after any transaction that changes the will.
 */
export function useWill(owner: Address | null) {
  const client = usePublicClient();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const ownerKey = owner?.toLowerCase() ?? null;

  const entry = useAppSelector(selectWillEntry(ownerKey));

  const refresh = useCallback(async () => {
    if (!ownerKey || !client) return;
    await dispatch(loadWill({ client, owner: ownerKey as Address }));
  }, [dispatch, client, ownerKey]);

  useEffect(() => {
    if (!ownerKey || !client) return;
    // Read the cache imperatively rather than depending on it, so landing a
    // result cannot re-trigger the effect that fetched it.
    const cached = store.getState().will.byOwner[ownerKey];
    if (cached?.status === "loading") return;
    if (
      cached?.status === "ready" &&
      cached.fetchedAt !== null &&
      Date.now() - cached.fetchedAt < STALE_MS
    ) {
      return;
    }
    dispatch(loadWill({ client, owner: ownerKey as Address }));
  }, [dispatch, store, client, ownerKey]);

  return {
    data: entry.bundle,
    loading: entry.status === "loading",
    error: entry.error,
    refresh,
  };
}
