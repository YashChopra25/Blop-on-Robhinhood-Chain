import type { Address } from "viem";
import type { RoleWill } from "./roles.types";

/**
 * One escrowed token as it reads to an heir on a claimable will.
 *
 * The heir's `myShare` is a fixed slice of `totalEscrowed`
 * (`totalEscrowed * allocation% `) — it does NOT shrink as other heirs claim.
 * `vaultBalance` is what is actually left in the vault right now.
 */
export interface InheritedTokenDisplay {
  /** The ERC-20 address. Replaces the Solana pair (TokenVault PDA, mint). */
  token: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Total ever escrowed for this mint (UI amount). */
  totalEscrowed: string;
  /** Currently remaining in the vault (UI amount). */
  vaultBalance: string;
  /** This heir's claimable slice of the snapshot (UI amount). */
  myShare: string;
  /** Whether this heir has already claimed this token. */
  claimed: boolean;
  /** Amount this heir already claimed (UI amount, "0" if not claimed). */
  claimedAmount: string;
}

/**
 * How a will reads to the heir looking at it.
 *
 * `active`   — the owner is still checking in.
 * `pending`  — some custodians have confirmed the passing, but not enough.
 * `unlocked` — quorum reached; the will is claimable and its media is shown.
 *
 * This mirrors `WillStatus` on-chain, but is named for what the heir sees
 * rather than for the lifecycle stage.
 */
export type LockState = "active" | "pending" | "unlocked";

/**
 * Where a claimable will sits on the post-death timeline.
 *
 * `active` / `pending` — quorum not reached; there is no timeline yet.
 * `grace`   — quorum reached, but `claim_*` is frozen while the owner may revoke.
 * `open`    — the heir can claim right now.
 * `closed`  — the claim window elapsed; teardown cranks may reclaim accounts.
 */
export type ClaimPhase = "active" | "pending" | "grace" | "open" | "closed";

export interface ClaimTimeline {
  phase: ClaimPhase;
  /** Unix seconds; null when quorum has never been reached. */
  claimableAt: number | null;
  /** When the owner's revocation window ends and claims open. */
  graceEndsAt: number | null;
  /** When the heirs’ exclusive claim window ends. */
  claimWindowEndsAt: number | null;
  /** Seconds until claims open; 0 once they are. */
  secondsUntilOpen: number;
  /** Seconds until the claim window shuts; 0 once it has. */
  secondsUntilClose: number;
  /** The program would accept a claim at this instant. */
  canClaimNow: boolean;
  /** Open, but the deadline is close enough to warn about. */
  closingSoon: boolean;
}

export interface InheritanceSummary {
  will: RoleWill;
  lock: LockState;
  timeline: ClaimTimeline;
  /** One line explaining why this will is open, or why it is not. */
  note: string;
  /** The heir still has to publish a document key, and the will is Active. */
  needsKey: boolean;
}
