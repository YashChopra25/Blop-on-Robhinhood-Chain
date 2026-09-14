import type { Address, PublicClient } from "viem";
import { vaultInheritanceAbi } from "./abi";
import { CONTRACT_ADDRESS } from "./config";
import { WILL_STATUS_LABEL, type WillView } from "./types";
import type { MyRoles, RoleWill } from "@/app/types/roles.types";

/**
 * Every will the given wallet participates in, split by role.
 *
 * Replaces the Solana client's `fetchMyRoles`, which scanned program accounts
 * with `memcmp(offset 40)` — a byte offset hand-derived from the Anchor account
 * layout, with a comment explaining where the 40 came from.
 *
 * The contract maintains reverse indices for exactly this query, so it is now a
 * typed call. That is a deliberate design choice rather than an event-indexer
 * dependency: an heir may need to discover their role decades from now, long
 * after any indexer this project ships has stopped running (see
 * SOLIDITY_ARCHITECTURE.md §7).
 *
 * The role lists are paginated because an owner can name any address without its
 * consent, so a griefer could inflate a victim's list. `PAGE` bounds a single
 * `eth_call`; the loop keeps paging until the contract reports no more.
 */
const PAGE = 100n;

const contract = {
  address: CONTRACT_ADDRESS,
  abi: vaultInheritanceAbi,
} as const;

export const EMPTY_ROLES: MyRoles = {
  beneficiaryWills: [],
  custodianWills: [],
};

async function allRoles(
  client: PublicClient,
  fn: "custodianRolesOf" | "beneficiaryRolesOf",
  wallet: Address
): Promise<Address[]> {
  const out: Address[] = [];
  let offset = 0n;
  for (;;) {
    const [page, total] = (await client.readContract({
      ...contract,
      functionName: fn,
      args: [wallet, offset, PAGE],
    })) as unknown as [Address[], bigint];
    out.push(...page);
    offset += BigInt(page.length);
    if (page.length === 0 || offset >= total) break;
  }
  return out;
}

export async function fetchMyRoles(
  client: PublicClient,
  wallet: Address
): Promise<MyRoles> {
  const [custodianOf, beneficiaryOf] = await Promise.all([
    allRoles(client, "custodianRolesOf", wallet),
    allRoles(client, "beneficiaryRolesOf", wallet),
  ]);

  // Every will referenced by either role, read once.
  const owners = Array.from(new Set([...custodianOf, ...beneficiaryOf]));
  if (owners.length === 0) return EMPTY_ROLES;

  // One multicall for the wills, one for the per-member records. On Solana this
  // was `fetchMultiple` plus the data already carried by the scanned accounts.
  const willResults = await client.multicall({
    contracts: owners.map((o) => ({
      ...contract,
      functionName: "getWill" as const,
      args: [o] as const,
    })),
    allowFailure: true,
  });

  const memberResults = await client.multicall({
    contracts: [
      ...custodianOf.map((o) => ({
        ...contract,
        functionName: "getCustodian" as const,
        args: [o, wallet] as const,
      })),
      ...beneficiaryOf.map((o) => ({
        ...contract,
        functionName: "getBeneficiary" as const,
        args: [o, wallet] as const,
      })),
    ],
    allowFailure: true,
  });

  const willByOwner = new Map<Address, WillView>();
  owners.forEach((o, i) => {
    const r = willResults[i];
    if (r.status === "success") {
      const w = r.result as unknown as WillView;
      if (w.exists) willByOwner.set(o, w);
    }
  });

  const base = (owner: Address): Omit<RoleWill, "allocationBps"> | null => {
    const w = willByOwner.get(owner);
    if (!w) return null;
    return {
      owner,
      status: WILL_STATUS_LABEL[w.status],
      approvalsReceived: w.approvalsReceived,
      minApprovals: w.minApprovals,
      mediaCount: w.mediaCount,
      tokenVaultCount: w.tokenVaultCount,
      claimableAt: Number(w.claimableAt),
      graceEndsAt: Number(w.graceEndsAt),
      claimWindowEndsAt: Number(w.claimWindowEndsAt),
      claimsOpen: w.claimsOpen,
      teardownOpen: w.teardownOpen,
    };
  };

  const custodianWills: RoleWill[] = [];
  custodianOf.forEach((owner, i) => {
    const b = base(owner);
    const r = memberResults[i];
    if (!b || r.status !== "success") return;
    const c = r.result as unknown as { hasApproved: boolean };
    custodianWills.push({ ...b, hasApproved: c.hasApproved });
  });

  const beneficiaryWills: RoleWill[] = [];
  beneficiaryOf.forEach((owner, i) => {
    const b = base(owner);
    const r = memberResults[custodianOf.length + i];
    if (!b || r.status !== "success") return;
    const ben = r.result as unknown as {
      allocationBps: number;
      hasClaimed: boolean;
      hasEncryptionKey: boolean;
    };
    beneficiaryWills.push({
      ...b,
      allocationBps: ben.allocationBps,
      hasClaimed: ben.hasClaimed,
      hasEncryptionKey: ben.hasEncryptionKey,
    });
  });

  return { beneficiaryWills, custodianWills };
}
