import { createPublicClient, http } from "viem";
import { CHAIN, RPC_URL } from "./config";

/**
 * A wallet-free client for reads that happen outside React (and on the server).
 * The analogue of `getReadonlyProgram()` in the Solana client.
 *
 * Kept out of `client.ts` on purpose: that module is `"use client"`, so a route
 * handler importing from it receives a client reference rather than this object,
 * and every `publicClient.multicall(...)` in `lib/server/authz.ts` threw — which
 * `authorizeCid` reported as "Could not verify access on-chain".
 */
export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL, { batch: true }),
});
