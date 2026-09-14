/**
 * On-chain authorization for the API layer.
 *
 * A session proves *which wallet* is calling (see `session.ts`). This module
 * answers the separate question of *what that wallet is allowed to touch*, and
 * it answers it from the chain rather than from anything the client sent.
 *
 * The rules mirror the contract's own state machine:
 *
 *   write (delete / rename)  → only the will's owner
 *   read  (fetch / metadata) → the owner, or an heir of that will once the will
 *                              is Claimable AND the owner's grace period has
 *                              elapsed — exactly when `claimInheritance` and
 *                              `claimToken` open on-chain
 *
 * This is defence in depth, not the primary control: documents are encrypted in
 * the browser before upload (see `lib/crypto.ts`), so even a total failure here
 * yields ciphertext. But it stops the pinning account from being used as an open
 * proxy, and it stops one user from deleting another's documents.
 *
 * ## What the migration deleted
 *
 * The Solana version of this file was 280 lines, most of it a hand-rolled
 * decoder: hardcoded account lengths (`WILL_LEN = 91`, `MEDIA_LEN = 123`,
 * `BENEFICIARY_LEN = 108`), hardcoded byte offsets, Anchor discriminators
 * recomputed as `sha256("account:<Name>")[0..8]`, a `getProgramAccounts` scan
 * with a memcmp over zero-padded CID bytes, and an import-time assertion to
 * catch the layout drifting out from under the offsets.
 *
 * All of it is gone. The ABI is the decoder, and the contract exposes
 * `mediaIndexOfCid` for an O(1) membership check.
 *
 * One interface change follows from that: the client now passes the **will
 * owner** alongside the CID. It always knows it (it is browsing a specific
 * will), and it removes the need for a global CID→will index that every
 * `addMedia` would have to pay for. A wrong owner simply fails the check.
 */

import { getAddress, type Address } from "viem";
import { publicClient } from "@/lib/evm/publicClient";
import { vaultInheritanceAbi } from "@/lib/evm/abi";
import { CONTRACT_ADDRESS } from "@/lib/evm/config";
import { WillStatus, type BeneficiaryView, type WillView } from "@/lib/evm/types";
import { normalizeAddress } from "./session";

const contract = {
  address: CONTRACT_ADDRESS,
  abi: vaultInheritanceAbi,
} as const;

export type CidAccess = "read" | "write";

export interface AuthzResult {
  allowed: boolean;
  /** Safe to show the caller; never leaks whether other people's wills exist. */
  reason?: string;
}

/**
 * True when `wallet` is an heir of `owner`'s will whose claim window has opened.
 *
 * The timing test is the contract's OWN verdict (`claimsOpen`), not a
 * re-derivation of it. The Solana version recomputed
 * `now >= claimableAt + GRACE_PERIOD_SECONDS` from a constant duplicated in the
 * client config — two places that could drift apart. There is now one.
 */
function isEntitledHeir(will: WillView, beneficiary: BeneficiaryView): boolean {
  if (will.status !== WillStatus.Claimable) return false;
  if (!will.claimsOpen) return false;
  return beneficiary.exists;
}

/**
 * Decide whether `wallet` may act on `cid` within `owner`'s will.
 *
 * A CID the will does not reference is denied for both modes: it is either not
 * ours to serve or was already removed from the will, and in both cases this API
 * should not be a general-purpose IPFS proxy.
 */
export async function authorizeCid(
  wallet: string,
  owner: string,
  cid: string,
  access: CidAccess
): Promise<AuthzResult> {
  const caller = normalizeAddress(wallet);
  const willOwner = normalizeAddress(owner);
  if (!caller) return { allowed: false, reason: "Invalid wallet in session" };
  if (!willOwner) return { allowed: false, reason: "Invalid vault owner" };

  let found: boolean;
  let will: WillView;
  let beneficiary: BeneficiaryView;
  try {
    const results = await publicClient.multicall({
      contracts: [
        { ...contract, functionName: "mediaIndexOfCid", args: [getAddress(willOwner), cid] },
        { ...contract, functionName: "getWill", args: [getAddress(willOwner)] },
        {
          ...contract,
          functionName: "getBeneficiary",
          args: [getAddress(willOwner), getAddress(caller)],
        },
      ],
      allowFailure: false,
    });
    [found] = results[0] as unknown as [boolean, number];
    will = results[1] as unknown as WillView;
    beneficiary = results[2] as unknown as BeneficiaryView;
  } catch (err) {
    // A failing RPC must never fail open.
    console.error("[authz] chain lookup failed:", err);
    return {
      allowed: false,
      reason: "Could not verify access on-chain; try again shortly",
    };
  }

  if (!will.exists) {
    return { allowed: false, reason: "This document is not referenced by any vault" };
  }
  if (!found) {
    return { allowed: false, reason: "This document is not referenced by any vault" };
  }

  if (caller === willOwner) return { allowed: true };

  if (access === "read" && isEntitledHeir(will, beneficiary)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      access === "write"
        ? "Only the vault owner can modify this document"
        : "You do not have access to this document yet",
  };
}

/** Whether `wallet` owns a will at all — used to gate uploads. */
export async function hasWill(wallet: string): Promise<boolean> {
  const addr = normalizeAddress(wallet);
  if (!addr) return false;
  try {
    const will = (await publicClient.readContract({
      ...contract,
      functionName: "getWill",
      args: [getAddress(addr)],
    })) as unknown as WillView;
    return will.exists;
  } catch (err) {
    console.error("[authz] hasWill lookup failed:", err);
    return false;
  }
}

export type { Address };
