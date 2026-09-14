import type { Abi, Address, Hash } from "viem";
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

/**
 * Transaction lifecycle helpers.
 *
 * The Solana client called `program.methods.x().accounts({...}).rpc()`, which
 * signs, sends and confirms in one step — and therefore only discovers a program
 * error AFTER the user has approved a transaction. The EVM flow adds a step the
 * Solana one could not have:
 *
 *     simulateContract  →  writeContract  →  waitForTransactionReceipt
 *     (revert surfaces      (wallet          (finality per the table below)
 *      BEFORE signing)       prompt)
 *
 * so `QuorumUnreachable` becomes a readable message before the wallet opens
 * rather than a failed transaction after it.
 */

/**
 * How many confirmations to wait for, per action.
 *
 * Robinhood Chain has two-phase finality: sub-second soft confirmation from the
 * sequencer, then posting to Ethereum minutes later, then Ethereum finality
 * ~13 minutes after that. The docs advise relying on soft confirmations for
 * ordinary interactions and waiting for L1 posting on high-value or irreversible
 * ones.
 *
 * One confirmation is therefore the default; what changes for value-moving
 * actions is that the UI LABELS the state honestly ("soft-confirmed") and links
 * to the explorer, instead of silently presenting sub-second inclusion as final.
 * See ROBINHOOD_CHAIN.md §6.
 */
export const CONFIRMATIONS: Record<string, number> = {
  default: 1,
  depositToken: 1,
  withdrawToken: 1,
  claimToken: 1,
  sweepTokenVault: 1,
};

/** Actions that move value, and so get the "soft-confirmed" treatment in the UI. */
export const VALUE_MOVING = new Set([
  "depositToken",
  "withdrawToken",
  "claimToken",
  "sweepTokenVault",
]);

export function confirmationsFor(functionName: string): number {
  return CONFIRMATIONS[functionName] ?? CONFIRMATIONS.default;
}

export function movesValue(functionName: string): boolean {
  return VALUE_MOVING.has(functionName);
}

/**
 * Turn a viem error into something a person can act on.
 *
 * Successor to `humanizeError` in the Solana client, which scraped
 * `Error Message: …` out of an Anchor log string. Here the contract's custom
 * errors are decoded structurally from the ABI, so the mapping is exact rather
 * than a regex over a log.
 */
const ERROR_MESSAGES: Record<string, string> = {
  // ---- will lifecycle ----
  WillAlreadyExists: "You already have a will. Delete it before creating a new one.",
  WillNotFound: "No will found for this address.",
  WillNotActive:
    "The will is not active. It is in death confirmation, so it can no longer be configured.",
  WillNotClaimable: "This will is not claimable yet.",
  WillHasDependents:
    "Remove every document, custodian and beneficiary before deleting the will.",
  WillHasTokenVaults: "Withdraw your escrowed tokens before deleting the will.",
  // ---- configuration ----
  InvalidThreshold: "The inactivity period must be greater than zero.",
  InvalidMinApprovals: "At least one custodian approval is required.",
  MinApprovalsExceedCustodians:
    "The required approvals cannot exceed the number of custodians. Lower the quorum first.",
  QuorumUnreachable:
    "Add at least one custodian, and make sure the required approvals do not exceed the number of custodians.",
  OwnerStillActive:
    "The owner has checked in recently. The inactivity period has not elapsed yet.",
  // ---- custodians ----
  NotACustodian: "You are not a custodian of this will.",
  CustodianAlreadyExists: "That address is already a custodian.",
  CustodianNotFound: "That address is not a custodian of this will.",
  AlreadyApproved: "You have already confirmed this passing.",
  NoCustodians: "Name at least one custodian before escrowing tokens.",
  TooManyCustodians: "This will has reached the maximum number of custodians.",
  // ---- beneficiaries ----
  NotABeneficiary: "You are not a beneficiary of this will.",
  BeneficiaryAlreadyExists: "That address is already a beneficiary.",
  BeneficiaryNotFound: "That address is not a beneficiary of this will.",
  AlreadyClaimed: "You have already claimed this.",
  AllocationExceeded: "Total allocation cannot exceed 100%.",
  TooManyBeneficiaries: "This will has reached the maximum number of beneficiaries.",
  InvalidEncryptionKey: "That encryption key is not valid.",
  // ---- media ----
  MediaNotFound: "That document is not recorded on this will.",
  InvalidCid: "That IPFS CID is not valid.",
  DuplicateCid: "That document is already recorded on this will.",
  TooManyMedia: "This will has reached the maximum number of documents.",
  MediaIndexExhausted: "This will has exhausted its document index.",
  // ---- tokens ----
  InvalidToken: "That token address is not valid.",
  InvalidAmount: "The amount must be greater than zero.",
  TokenVaultNotFound: "No escrow exists for that token.",
  TooManyTokenVaults: "This will has reached the maximum number of escrowed tokens.",
  NothingToClaim: "There is nothing for you to claim from this token.",
  // ---- timeline ----
  GracePeriodNotElapsed:
    "Claims are not open yet — the owner's window to revoke has not passed.",
  ClaimWindowStillOpen:
    "The heirs' claim window is still open, so the estate cannot be wound down yet.",
  NothingToRevoke:
    "There is no death confirmation to revoke, or the window to revoke has expired.",
  // ---- generic ----
  ZeroAddress: "That address is not valid.",
  ValueTooLarge: "That value is too large.",
  // ---- OpenZeppelin ----
  ReentrancyGuardReentrantCall:
    "This token tried to re-enter the vault mid-transfer and was rejected.",
  SafeERC20FailedOperation:
    "The token rejected the transfer. Check your balance and allowance.",
};

export function humanizeError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((err) => err instanceof UserRejectedRequestError)) {
      return "You rejected the request in your wallet.";
    }
    const reverted = e.walk(
      (err) => err instanceof ContractFunctionRevertedError
    ) as ContractFunctionRevertedError | null;
    if (reverted) {
      const name = reverted.data?.errorName;
      if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
      if (name) return name;
      if (reverted.reason) return reverted.reason;
    }
    return e.shortMessage || e.message;
  }
  if (e instanceof Error) {
    return e.message.length > 180 ? `${e.message.slice(0, 180)}…` : e.message;
  }
  return "Transaction failed";
}

export interface WriteRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  account: Address;
}

export interface TxResult {
  hash: Hash;
  /** True when the receipt landed with status "success". */
  confirmed: boolean;
  blockNumber: bigint;
}
