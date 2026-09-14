import type { Address, PublicClient } from "viem";
import { vaultInheritanceAbi } from "./abi";
import { CONTRACT_ADDRESS } from "./config";
import {
  EMPTY_BUNDLE,
  WillStatus,
  type BeneficiaryView,
  type CustodianView,
  type MediaView,
  type TokenVaultView,
  type WillBundle,
  type WillView,
} from "./types";

/**
 * Read a will and every child, in ONE multicall round trip.
 *
 * This replaces the Solana client's `fetchWillBundle`, which had to:
 *   * `fetchNullable` the will PDA, then
 *   * run four separate `getProgramAccounts` sweeps with memcmp filters, then
 *   * decode each account individually (`allTolerant`) because a single account
 *     left on an older layout would otherwise reject the whole batch and blank
 *     the dashboard.
 *
 * None of that survives the migration. Storage layout is fixed at compile time,
 * so there is no stale-layout class to tolerate; the contract returns typed
 * arrays directly, so there is no decoder to hand-roll; and `multicall` collapses
 * five reads into one request, which matters because the public Robinhood Chain
 * RPCs are rate-limited.
 *
 * The partial-failure behaviour IS preserved: a will that reads successfully is
 * never thrown away because a child list failed.
 */
export interface WillFetchResult {
  bundle: WillBundle;
  /** Names of child lists that could not be loaded; the bundle has them empty. */
  failures: string[];
}

const contract = {
  address: CONTRACT_ADDRESS,
  abi: vaultInheritanceAbi,
} as const;

export async function fetchWillBundle(
  client: PublicClient,
  owner: Address
): Promise<WillFetchResult> {
  const results = await client.multicall({
    contracts: [
      { ...contract, functionName: "getWill", args: [owner] },
      { ...contract, functionName: "getCustodians", args: [owner] },
      { ...contract, functionName: "getBeneficiaries", args: [owner] },
      { ...contract, functionName: "getMedia", args: [owner] },
      { ...contract, functionName: "getTokenVaults", args: [owner] },
    ],
    // Do not let one failing call reject the batch — the same reasoning as the
    // Solana client's `Promise.allSettled`.
    allowFailure: true,
  });

  const [willRes, custRes, benRes, mediaRes, vaultRes] = results;

  if (willRes.status === "failure") {
    throw willRes.error ?? new Error("Failed to read the will");
  }

  const will = willRes.result as unknown as WillView;
  if (!will.exists || will.status === WillStatus.None) {
    return { bundle: EMPTY_BUNDLE(owner), failures: [] };
  }

  const failures: string[] = [];
  const take = <T,>(
    res: (typeof results)[number],
    name: string,
    fallback: T
  ): T => {
    if (res.status === "success") return res.result as unknown as T;
    console.error(`[willFetch] failed to load ${name}:`, res.error);
    failures.push(name);
    return fallback;
  };

  return {
    bundle: {
      owner,
      will,
      custodians: take<CustodianView[]>(custRes, "custodians", []),
      beneficiaries: take<BeneficiaryView[]>(benRes, "beneficiaries", []),
      media: take<MediaView[]>(mediaRes, "media", []),
      tokenVaults: take<TokenVaultView[]>(vaultRes, "tokenVaults", []),
    },
    failures,
  };
}

/** Just the will, for callers that do not need the children. */
export async function fetchWill(
  client: PublicClient,
  owner: Address
): Promise<WillView | null> {
  const will = (await client.readContract({
    ...contract,
    functionName: "getWill",
    args: [owner],
  })) as unknown as WillView;
  return will.exists ? will : null;
}
