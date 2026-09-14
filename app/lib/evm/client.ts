"use client";

import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";
import type { Transport } from "viem";
import { CHAIN, CHAIN_ID, RPC_URL, WALLETCONNECT_PROJECT_ID } from "./config";
import { SUPPORTED_CHAINS, type SupportedChainId } from "./chains";

/**
 * One transport per supported chain id.
 *
 * `CHAIN` is resolved from `NEXT_PUBLIC_CHAIN_ID` at runtime, so its type is the
 * union of all three supported chains and wagmi therefore requires a transport
 * for each id. Only `CHAIN` is registered in `chains` below, so the other
 * entries are never reached — but they have to be present to type the config.
 *
 * The configured chain gets `RPC_URL` (which honours the
 * `NEXT_PUBLIC_RPC_URL` override); the rest fall back to their public endpoint.
 */
const transports = Object.fromEntries(
  SUPPORTED_CHAINS.map((chain) => [
    chain.id,
    http(chain.id === CHAIN_ID ? RPC_URL : chain.rpcUrls.default.http[0], {
      // The public Robinhood Chain endpoints are rate-limited, so batch reads
      // into single requests and retry a rejected one rather than surfacing it.
      batch: true,
      retryCount: 3,
      retryDelay: 250,
    }),
  ]),
) as Record<SupportedChainId, Transport>;

/**
 * wagmi configuration.
 *
 * Successor to the Solana app's `providers.tsx` stack
 * (`ConnectionProvider` → `WalletProvider` → `WalletModalProvider`).
 *
 * Only the configured chain is registered, deliberately. wagmi will then report
 * any other network as unsupported, which is what drives the "wrong network"
 * banner — the Solana app had no equivalent, because Solana wallets do not
 * expose a chain the dapp can disagree with.

 */
export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [
    // injected({ shimDisconnect: true }),
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
          }),
        ]
      : []),
  ],
  transports,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

// The wallet-free read client lives in `./publicClient`: this module is
// "use client", so server code importing it from here gets a client reference.
