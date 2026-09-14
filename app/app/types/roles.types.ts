import type { Address } from "viem";

/**
 * A will the connected wallet is attached to, in one of two roles.
 *
 * `willPubkey` is gone: on Solana the will lived at its own PDA, so a list item
 * needed both the account address and the owner. On EVM the will IS keyed by the
 * owner's address, so `owner` alone identifies it — one field fewer, and one
 * fewer way to pass the wrong one.
 */
export interface RoleWill {
  owner: Address;
  status: string;
  // From the will itself, so a list can show quorum progress without refetching.
  approvalsReceived: number;
  minApprovals: number;
  mediaCount: number;
  /** How many token escrows are held on the will. */
  tokenVaultCount: number;
  /**
   * Unix seconds at which custodian quorum was reached, or 0 if it never has
   * been. Both post-death deadlines are measured from here.
   */
  claimableAt: number;
  /**
   * Deadlines and gates as the CONTRACT computes them.
   *
   * On Solana these had to be re-derived on the client from `constants.rs`, in
   * three separate files. `getWill` now returns them, so the UI and the chain can
   * never disagree about whether a button should be enabled.
   */
  graceEndsAt: number;
  claimWindowEndsAt: number;
  claimsOpen: boolean;
  teardownOpen: boolean;
  // Beneficiary-specific
  /** Basis points (0–10 000), exactly as the contract stores it. */
  allocationBps?: number;
  hasClaimed?: boolean;
  /** Whether this heir has published an X25519 key documents can be sealed to. */
  hasEncryptionKey?: boolean;
  // Custodian-specific
  hasApproved?: boolean;
}

export interface MyRoles {
  beneficiaryWills: RoleWill[];
  custodianWills: RoleWill[];
}
