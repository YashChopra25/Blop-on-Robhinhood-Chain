import type { Address, Hex } from "viem";

/**
 * Mirrors of the contract's view structs.
 *
 * Successor to the `IdlAccounts<VaultInheritance>[...]` types the Anchor client
 * derived from the IDL. viem infers these from the ABI's `as const`, but naming
 * them keeps component props readable and gives one place to document what each
 * field means.
 *
 * Two representation changes from the Solana types:
 *   * `PublicKey` → `Address` (a `0x…` string)
 *   * `BN` → native `bigint` (no wrapper, no `.toNumber()` precision cliff)
 */

/** Matches the on-chain `enum Status`. `None` means "no will exists". */
export enum WillStatus {
  None = 0,
  Active = 1,
  PendingInheritance = 2,
  Claimable = 3,
}

export const WILL_STATUS_LABEL: Record<WillStatus, string> = {
  [WillStatus.None]: "none",
  [WillStatus.Active]: "active",
  [WillStatus.PendingInheritance]: "pendingInheritance",
  [WillStatus.Claimable]: "claimable",
};

export interface WillView {
  exists: boolean;
  status: WillStatus;
  minApprovals: number;
  approvalsReceived: number;
  custodianCount: number;
  mediaCount: number;
  mediaIndex: number;
  beneficiaryCount: number;
  beneficiariesClaimed: number;
  tokenVaultCount: number;
  totalAllocatedBps: number;
  approvalEpoch: number;
  /** Bumped on every createWill; scopes the double-claim ledger to one will. */
  incarnation: number;
  createdAt: bigint;
  lastActiveAt: bigint;
  inactivityThreshold: bigint;
  claimableAt: bigint;
  // ---- derived on-chain, so the UI can never disagree with the contract ----
  graceEndsAt: bigint;
  claimWindowEndsAt: bigint;
  quorumReachable: boolean;
  claimsOpen: boolean;
  teardownOpen: boolean;
  inactivityElapsed: boolean;
}

export interface CustodianView {
  wallet: Address;
  exists: boolean;
  /** Already discounted for the approval epoch — a revoked round reads false. */
  hasApproved: boolean;
  approvedEpoch: number;
  lastApprovedAt: bigint;
}

export interface BeneficiaryView {
  wallet: Address;
  exists: boolean;
  hasClaimed: boolean;
  allocationBps: number;
  encryptionPubkey: Hex;
  hasEncryptionKey: boolean;
}

export interface MediaView {
  index: number;
  mediaType: Hex;
  cid: string;
}

export interface TokenVaultView {
  token: Address;
  /** Cumulative received; the denominator for every heir's share. */
  totalDeposited: bigint;
  /** Still held for this will. */
  remaining: bigint;
}

export interface TokenClaimView {
  claimed: boolean;
  amount: bigint;
}

/** A will plus all of its children — the successor to `WillBundle`. */
export interface WillBundle {
  owner: Address;
  will: WillView | null;
  custodians: CustodianView[];
  beneficiaries: BeneficiaryView[];
  media: MediaView[];
  tokenVaults: TokenVaultView[];
}

export const EMPTY_BUNDLE = (owner: Address): WillBundle => ({
  owner,
  will: null,
  custodians: [],
  beneficiaries: [],
  media: [],
  tokenVaults: [],
});
