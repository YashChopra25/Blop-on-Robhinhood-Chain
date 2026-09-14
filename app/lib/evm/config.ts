import type { Address } from "viem";
import { CHAINS_BY_ID, isSupportedChain, type SupportedChainId } from "./chains";
import { deployments } from "./deployments";

/** Public, client-safe configuration. */

/**
 * Target chain.
 *
 * No silent fallback, deliberately — this is the direct successor to the
 * Solana app's `requiredProgramId()`, which refused to start rather than guess a
 * program address after a stale default had silently pointed the whole app at
 * the wrong program. The same reasoning applies with more force here: a wrong
 * chain id means every read returns empty and every write goes to the wrong
 * network.
 */
function requiredChainId(): SupportedChainId {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID?.trim();
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_CHAIN_ID is not set. Expected 4663 (Robinhood Chain), " +
        "46630 (Robinhood Chain Testnet) or 31337 (local Anvil)."
    );
  }
  const id = Number(raw);
  if (!isSupportedChain(id)) {
    throw new Error(
      `NEXT_PUBLIC_CHAIN_ID=${raw} is not a supported chain. ` +
        `Expected one of: ${Object.keys(CHAINS_BY_ID).join(", ")}.`
    );
  }
  return id;
}

export const CHAIN_ID = requiredChainId();
export const CHAIN = CHAINS_BY_ID[CHAIN_ID];

/**
 * Contract address.
 *
 * Resolved from the deployment record written by `forge script Deploy.s.sol`
 * and synced by `contracts/script/sync-abi.sh`, with an env override for
 * previews that point at a one-off deployment.
 */
function requiredContractAddress(): Address {
  const override = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim();
  const raw = override || deployments[CHAIN_ID];
  if (!raw) {
    throw new Error(
      `No VaultInheritance address for chain ${CHAIN_ID}. Deploy the contract ` +
        `(forge script script/Deploy.s.sol:Deploy), run contracts/script/sync-abi.sh, ` +
        `or set NEXT_PUBLIC_CONTRACT_ADDRESS.`
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(`Contract address is not a valid EVM address: ${raw}`);
  }
  return raw as Address;
}

export const CONTRACT_ADDRESS = requiredContractAddress();

/**
 * RPC endpoint.
 *
 * Defaults to the chain's public endpoint. The Robinhood Chain docs state that
 * the public endpoints are rate-limited and not recommended for production, so
 * a dedicated provider URL should be supplied here for any real deployment.
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || CHAIN.rpcUrls.default.http[0];

/**
 * The chain label and the RPC endpoint have to agree — the successor to the
 * Solana app's `assertClusterMatchesEndpoint`, which existed because a
 * `localnet` label had once been paired with a devnet URL and every explorer
 * link in the UI pointed at the wrong network.
 *
 * A custom provider URL (Alchemy, QuickNode, …) cannot be classified by
 * hostname, so it is trusted; only an obvious mismatch is rejected.
 */
function assertChainMatchesRpc() {
  const host = RPC_URL.toLowerCase();
  const isLocal = host.includes("127.0.0.1") || host.includes("localhost");
  const expected =
    isLocal
      ? 31337
      : host.includes("rpc.testnet.chain.robinhood.com")
        ? 46630
        : host.includes("rpc.mainnet.chain.robinhood.com")
          ? 4663
          : null;

  if (expected !== null && expected !== CHAIN_ID) {
    throw new Error(
      `Configuration mismatch: NEXT_PUBLIC_CHAIN_ID is ${CHAIN_ID} but ` +
        `NEXT_PUBLIC_RPC_URL points at chain ${expected}. Fix one of them.`
    );
  }
}
assertChainMatchesRpc();

/** WalletConnect project id. Optional — injected wallets work without it. */
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || undefined;

export const MAX_ALLOCATION_BPS = 10_000;

/**
 * Post-death timeline. These MUST match the contract constants; the UI uses them
 * for countdowns it renders before a read lands.
 *
 * Note the important difference from the Solana app: there, these values were
 * the ONLY source of truth on the client, re-derived in three separate files.
 * Here the contract itself returns `graceEndsAt`, `claimWindowEndsAt`,
 * `claimsOpen` and `teardownOpen` from `getWill`, so these constants are a
 * display fallback rather than the authority. `lib/evm/contractConstants.ts`
 * asserts they agree with the deployed contract at runtime.
 */
export const GRACE_PERIOD_SECONDS = 7 * 24 * 60 * 60;
export const CLAIM_WINDOW_SECONDS = 90 * 24 * 60 * 60;

/**
 * The contract stores an IPFS CID as a `string` capped at 64 bytes — the same
 * width as the Solana program's `[u8; 64]` field, which fits both a CIDv0
 * (46-char base58, `Qm...`) and a CIDv1 (59-char base32, `bafy...`).
 */
export const CID_BYTE_LEN = 64;

/** MIME type is a `bytes16` on-chain, mirroring the Solana `[u8; 16]`. */
export const MEDIA_TYPE_BYTE_LEN = 16;

/**
 * Whether the configured chain has a block explorer at all.
 *
 * Local Anvil does not. Callers must check this before rendering a link:
 * `explorerUrl()` returns "" there, and an `<a href="">` resolves to the CURRENT
 * page, so a "view tx" link silently reloads the dashboard instead of opening
 * anything. Use `<ExplorerLink>` in components/dashboard/shared/ui.tsx, which
 * handles both cases.
 */
export const HAS_EXPLORER = !!CHAIN.blockExplorers?.default.url;

/** Explorer link for the configured chain. Empty string when there is none. */
export function explorerUrl(
  value: string,
  kind: "address" | "tx" = "address"
): string {
  const base = CHAIN.blockExplorers?.default.url;
  if (!base) return ""; // local Anvil has no explorer
  return `${base}/${kind}/${value}`;
}

export function explorerTxUrl(hash: string): string {
  return explorerUrl(hash, "tx");
}
