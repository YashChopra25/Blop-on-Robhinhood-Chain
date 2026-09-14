import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "./index";
import { EMPTY_WILL_ENTRY, type WillEntry } from "./willSlice";
import { evaluateWillReadiness } from "@/lib/willReadiness";
import type { WillBundle } from "@/lib/evm/types";
import { WILL_STATUS_LABEL, WillStatus } from "@/lib/evm/types";

const NO_MEDIA: WillBundle["media"] = [];
const NO_CUSTODIANS: WillBundle["custodians"] = [];
const NO_BENEFICIARIES: WillBundle["beneficiaries"] = [];
const NO_TOKEN_VAULTS: WillBundle["tokenVaults"] = [];

/** The cache entry for one owner. Never undefined, so callers can read freely. */
export function selectWillEntry(owner: string | null) {
  return (state: RootState): WillEntry =>
    (owner ? state.will.byOwner[owner] : undefined) ?? EMPTY_WILL_ENTRY;
}

export const selectConnectedOwner = (state: RootState) =>
  state.will.connectedOwner;

/** The connected wallet's own will bundle. */
export const selectMyWillEntry = (state: RootState): WillEntry =>
  selectWillEntry(state.will.connectedOwner)(state);

export const selectMyBundle = (state: RootState) =>
  selectMyWillEntry(state).bundle;

export const selectMyWill = (state: RootState) =>
  selectMyWillEntry(state).bundle?.will ?? null;

export const selectMyCustodians = (state: RootState) =>
  selectMyWillEntry(state).bundle?.custodians ?? NO_CUSTODIANS;

export const selectMyBeneficiaries = (state: RootState) =>
  selectMyWillEntry(state).bundle?.beneficiaries ?? NO_BENEFICIARIES;

export const selectMyMedia = (state: RootState) =>
  selectMyWillEntry(state).bundle?.media ?? NO_MEDIA;

export const selectMyTokenVaults = (state: RootState) =>
  selectMyWillEntry(state).bundle?.tokenVaults ?? NO_TOKEN_VAULTS;

/**
 * `"active" | "pendingInheritance" | "claimable"`, or null with no will.
 *
 * On Solana this had to unwrap Anchor's `{ active: {} }` enum encoding with
 * `Object.keys(...)[0]`. A Solidity enum decodes to a plain number, so the
 * mapping is a lookup rather than a shape inspection.
 */
export const selectMyWillStatus = (state: RootState) => {
  const will = selectMyWill(state);
  return will ? WILL_STATUS_LABEL[will.status] ?? "unknown" : null;
};

/** Only an Active will accepts owner mutations. */
export const selectMyWillIsActive = (state: RootState) =>
  selectMyWill(state)?.status === WillStatus.Active;

/**
 * Whether the connected wallet's will may accept documents and tokens yet —
 * memoised so the checklist array is stable between renders.
 */
export const selectMyWillReadiness = createSelector(
  [selectMyBundle],
  (bundle) => evaluateWillReadiness(bundle),
);

// ---- roles -------------------------------------------------------------

export const selectMyRoles = (state: RootState) => state.roles.data;
export const selectRolesLoading = (state: RootState) =>
  state.roles.status === "loading";
export const selectRolesError = (state: RootState) => state.roles.error;
