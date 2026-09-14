"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { useWill, type WillBundle } from "./useWill";
import { useParsedAddress } from "./useParsedAddress";
import { claimTimeline, lockStateOf } from "@/lib/inheritance";
import { useNow } from "./useNow";
import { WILL_STATUS_LABEL, type BeneficiaryView } from "@/lib/evm/types";
import type { ClaimTimeline, LockState } from "@/app/types/inheritance.types";

interface UseInheritedWillResult {
  owner: Address | null;
  /** The address in the URL could not be parsed as an EVM address. */
  invalidOwner: boolean;
  data: WillBundle | null;
  /** A will exists on-chain for this owner. */
  exists: boolean;
  lock: LockState | null;
  /**
   * Where the will sits on the post-death timeline. Null with no will. The
   * claim buttons key off `timeline.canClaimNow`, which mirrors the contract's
   * `requireClaimsOpen` guard exactly.
   */
  timeline: ClaimTimeline | null;
  me: Address | null;
  myBeneficiary: BeneficiaryView | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads one will by its owner address and resolves the connected wallet's
 * standing on it as an heir. `myBeneficiary` is undefined when this wallet is
 * not named on the will at all.
 */
export function useInheritedWill(ownerStr: string): UseInheritedWillResult {
  const { address: me } = useAccount();
  const owner = useParsedAddress(ownerStr);
  const { data, loading, error, refresh } = useWill(owner);
  // One-second tick: this page shows a live countdown to the next deadline.
  const now = useNow(1000);

  const will = data?.will ?? null;
  const status = will ? WILL_STATUS_LABEL[will.status] : null;

  const timeline = useMemo(
    () =>
      will && status
        ? claimTimeline(status, Number(will.claimableAt), now)
        : null,
    [will, status, now],
  );

  // Address comparison is case-insensitive: EIP-55 gives the same address two
  // valid spellings, and the contract returns the checksummed form while a
  // connector may report either.
  const myBeneficiary = useMemo(
    () =>
      data?.beneficiaries.find(
        (b) => me && b.wallet.toLowerCase() === me.toLowerCase()
      ),
    [data, me]
  );

  return {
    owner,
    invalidOwner: ownerStr.length > 0 && owner === null,
    data,
    exists: will !== null,
    lock: status ? lockStateOf(status) : null,
    timeline,
    me: me ?? null,
    myBeneficiary,
    loading,
    error,
    refresh,
  };
}
