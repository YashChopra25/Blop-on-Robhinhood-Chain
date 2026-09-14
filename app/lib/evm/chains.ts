import { defineChain } from "viem";

/**
 * Robinhood Chain network definitions.
 *
 * EVERY value here comes from the official documentation at
 * docs.robinhood.com/chain and was independently confirmed against the live RPC
 * endpoints on 2026-09-12 (`eth_chainId` → 0x1237 / 0xb626). Nothing is
 * guessed. See ../../ROBINHOOD_CHAIN.md for the full verification log and
 * ../../contracts/config/networks.json for the canonical copy shared with the
 * deployment scripts.
 *
 * This is the ONLY place a Robinhood Chain RPC, chain id or explorer URL is
 * written in the frontend. Everything else reads it from here.
 */

/**
 * Multicall3, at the address it is deployed to on 100+ chains.
 *
 * viem's `client.multicall()` refuses to run unless the chain declares this —
 * "Chain X does not support contract multicall3" — and this app reads a will,
 * its custodians, heirs, media and token vaults in ONE batched call
 * (`lib/evm/willFetch.ts`), so without it every dashboard read fails.
 *
 * Verified live against both Robinhood Chain RPCs on 2026-09-12: the contract
 * is present at this address on 4663 and 46630, and the runtime bytecode is
 * byte-identical across the two (keccak
 * 0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891), i.e. the
 * canonical deterministic deployment rather than a re-deploy.
 *
 * Anvil does NOT ship it — a fresh local node has no code at this address, so
 * `contracts/script/anvil-dev.sh` installs it before deploying the vault.
 */
const MULTICALL3 = {
  multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
} as const;

/** Robinhood Chain mainnet — an Arbitrum L2 on Ethereum, native gas token ETH. */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
      webSocket: ["wss://feed.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api",
    },
  },
  contracts: MULTICALL3,
  testnet: false,
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
      webSocket: ["wss://feed.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api",
    },
  },
  contracts: MULTICALL3,
  testnet: true,
});

/** Local Anvil, for development. */
export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  contracts: MULTICALL3,
  testnet: true,
});

export const SUPPORTED_CHAINS = [robinhood, robinhoodTestnet, anvil] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export const CHAINS_BY_ID = {
  [robinhood.id]: robinhood,
  [robinhoodTestnet.id]: robinhoodTestnet,
  [anvil.id]: anvil,
} as const;

export function isSupportedChain(id: number | undefined): id is SupportedChainId {
  return id !== undefined && id in CHAINS_BY_ID;
}

export function chainById(id: number) {
  return isSupportedChain(id) ? CHAINS_BY_ID[id] : undefined;
}

/** Faucet for the testnet, from the official docs. Null where none exists. */
export const FAUCET_URLS: Record<number, string | null> = {
  [robinhood.id]: null,
  [robinhoodTestnet.id]: "https://faucet.testnet.chain.robinhood.com/",
  [anvil.id]: null,
};
