"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { simulateContract, waitForTransactionReceipt } from "@wagmi/core";
import type { Address, Hash, Hex } from "viem";
import { vaultInheritanceAbi } from "@/lib/evm/abi";
import { wagmiConfig } from "@/lib/evm/client";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/evm/config";
import { confirmationsFor } from "@/lib/evm/tx";
import { assertValidCid, keyToHex, mediaTypeToHex } from "@/lib/evm/codec";
import { erc20Abi } from "@/lib/evm/erc20";

/**
 * The single hook that exposes every contract function.
 *
 * Successor to the Solana client's `useVault`, which wrapped all 21 Anchor
 * instructions. Three things changed, and all three are improvements the EVM
 * model makes possible:
 *
 *  1. **No PDA derivation.** Every Solana call had to hand-build an
 *     `.accountsPartial({...})` map from six different PDA helpers, and getting
 *     one wrong (the u16-little-endian `mediaPda`, the token program behind
 *     `getAta`) produced a silent mismatch. Here the owner's address is the key,
 *     so the arguments ARE the business arguments.
 *
 *  2. **Simulation before signing.** `program.methods…​.rpc()` signed first and
 *     failed after. Every write below simulates first, so a contract revert
 *     surfaces as a readable error BEFORE the wallet prompt.
 *
 *  3. **Receipt awareness.** `.rpc()` returned a signature confirmed at
 *     `confirmed` commitment. Here each write returns the hash and the receipt,
 *     with the confirmation count chosen per action from one table (see
 *     `lib/evm/tx.ts` and ROBINHOOD_CHAIN.md §6).
 */

export interface WriteResult {
  hash: Hash;
  blockNumber: bigint;
}

const contract = {
  address: CONTRACT_ADDRESS,
  abi: vaultInheritanceAbi,
} as const;

export function useVault() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  /**
   * simulate → write → wait. Every mutating call goes through here, so the
   * lifecycle (and the error surface) is defined in exactly one place.
   */
  const send = useCallback(
    async (
      functionName: string,
      args: readonly unknown[]
    ): Promise<WriteResult> => {
      if (!address) throw new Error("Connect a wallet first");
      if (wrongNetwork) {
        throw new Error(
          "Wrong network. Switch to the configured chain before sending a transaction."
        );
      }

      // Surfaces a contract revert as a decoded custom error before the wallet
      // is ever opened. The Solana client had no equivalent step.
      const { request } = await simulateContract(wagmiConfig, {
        ...contract,
        functionName,
        args,
        account: address,
      } as never);

      const hash = await writeContractAsync(request as never);

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: confirmationsFor(functionName),
      });
      if (receipt.status !== "success") {
        throw new Error("Transaction reverted on-chain");
      }
      return { hash, blockNumber: receipt.blockNumber };
    },
    [address, wrongNetwork, writeContractAsync]
  );

  // ---------- Will lifecycle ----------

  const createWill = useCallback(
    (inactivityThresholdSecs: number | bigint, minApprovals: number) =>
      send("createWill", [BigInt(inactivityThresholdSecs), minApprovals]),
    [send]
  );

  /**
   * 0 means "leave unchanged" for both parameters — the successor to Anchor's
   * `Option<i64>` / `Option<u8>`. Unambiguous because 0 is already an invalid
   * value for each. Passing (0, 0) is a pure liveness ping.
   */
  const updateWill = useCallback(
    (inactivityThresholdSecs: number | bigint | null, minApprovals: number | null) =>
      send("updateWill", [
        BigInt(inactivityThresholdSecs ?? 0),
        minApprovals ?? 0,
      ]),
    [send]
  );

  /** Pure liveness ping — refreshes the dead-man's switch, changes nothing else. */
  const pingWill = useCallback(() => send("updateWill", [0n, 0]), [send]);

  const deleteWill = useCallback(() => send("deleteWill", []), [send]);

  // ---------- Media references (IPFS CIDs) ----------

  const addMedia = useCallback(
    (cid: string, mediaType: string) =>
      send("addMedia", [mediaTypeToHex(mediaType), assertValidCid(cid)]),
    [send]
  );

  const removeMedia = useCallback(
    (mediaIndex: number) => send("removeMedia", [mediaIndex]),
    [send]
  );

  // ---------- Custodians ----------

  const addCustodian = useCallback(
    (custodian: Address) => send("addCustodian", [custodian]),
    [send]
  );

  const removeCustodian = useCallback(
    (custodian: Address) => send("removeCustodian", [custodian]),
    [send]
  );

  /** Called BY a custodian, about the given will owner. */
  const confirmDeath = useCallback(
    (owner: Address) => send("confirmDeath", [owner]),
    [send]
  );

  /**
   * The owner's escape hatch: cancel an in-flight death confirmation and return
   * the will to Active. Valid while PendingInheritance, or Claimable but still
   * inside the grace period.
   */
  const revokeDeathConfirmation = useCallback(
    () => send("revokeDeathConfirmation", []),
    [send]
  );

  // ---------- Beneficiaries ----------

  const addBeneficiary = useCallback(
    (heir: Address, allocationBps: number) =>
      send("addBeneficiary", [heir, allocationBps]),
    [send]
  );

  const removeBeneficiary = useCallback(
    (heir: Address) => send("removeBeneficiary", [heir]),
    [send]
  );

  /** Called BY an heir, about the given will owner. */
  const claimInheritance = useCallback(
    (owner: Address) => send("claimInheritance", [owner]),
    [send]
  );

  /**
   * Heir-only: publish the X25519 public key that the owner seals document data
   * keys to. Until an heir does this, nothing can be encrypted for them.
   */
  const registerRecipientKey = useCallback(
    (owner: Address, encryptionPubkey: Uint8Array) =>
      send("registerRecipientKey", [owner, keyToHex(encryptionPubkey)]),
    [send]
  );

  // ---------- Token escrow ----------

  /**
   * ERC-20 escrow needs an allowance first — the step SPL did not have, because
   * there the owner signed the transfer itself inside the same instruction.
   *
   * The allowance is set to exactly `amount` rather than an unlimited approval:
   * this contract is immutable and non-upgradeable, but a bounded approval is
   * still the right default, and the extra transaction is a once-per-deposit
   * cost on an operation that happens rarely.
   */
  const approveToken = useCallback(
    async (token: Address, amount: bigint): Promise<WriteResult> => {
      if (!address) throw new Error("Connect a wallet first");
      const { request } = await simulateContract(wagmiConfig, {
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONTRACT_ADDRESS, amount],
        account: address,
      });
      const hash = await writeContractAsync(request);
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("Approval reverted");
      return { hash, blockNumber: receipt.blockNumber };
    },
    [address, writeContractAsync]
  );

  const allowanceOf = useCallback(
    async (token: Address): Promise<bigint> => {
      if (!address || !publicClient) return 0n;
      return publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, CONTRACT_ADDRESS],
      });
    },
    [address, publicClient]
  );

  /** Escrow (or top up) a token. Approves first if the allowance is short. */
  const depositToken = useCallback(
    async (token: Address, amount: bigint): Promise<WriteResult> => {
      const current = await allowanceOf(token);
      if (current < amount) await approveToken(token, amount);
      return send("depositToken", [token, amount]);
    },
    [allowanceOf, approveToken, send]
  );

  const withdrawToken = useCallback(
    (token: Address) => send("withdrawToken", [token]),
    [send]
  );

  /** Heir-only: claim this heir's proportional share of one escrowed token. */
  const claimToken = useCallback(
    (owner: Address, token: Address) => send("claimToken", [owner, token]),
    [send]
  );

  // ---------- Post-inheritance teardown (permissionless cranks) ----------
  // Anyone may call these once the heirs' claim window has closed. The value
  // always flows to the estate (the will owner), never to the caller.

  const sweepTokenVault = useCallback(
    (owner: Address, token: Address) => send("sweepTokenVault", [owner, token]),
    [send]
  );

  /**
   * Clear the estate's records. Replaces Solana's four separate rent cranks
   * (`cleanup_custodian` / `cleanup_beneficiary` / `cleanup_media` /
   * `close_will`) — rent has no EVM equivalent, but the lifecycle and the
   * timing gate do.
   *
   * Resumable: `maxItems` bounds the gas, and the call returns false while work
   * remains. The loop below finishes a large estate across several transactions.
   */
  const closeEstate = useCallback(
    (owner: Address, maxItems = 32) =>
      send("closeEstate", [owner, BigInt(maxItems)]),
    [send]
  );

  const closeEstateFully = useCallback(
    async (owner: Address, maxItems = 32): Promise<WriteResult[]> => {
      const results: WriteResult[] = [];
      // Bounded so a bug cannot spin forever; 32 × 32 covers the contract's caps.
      for (let i = 0; i < 32; i++) {
        results.push(await closeEstate(owner, maxItems));
        if (!publicClient) break;
        const still = await publicClient.readContract({
          ...contract,
          functionName: "getWill",
          args: [owner],
        });
        if (!(still as { exists: boolean }).exists) break;
      }
      return results;
    },
    [closeEstate, publicClient]
  );

  return useMemo(
    () => ({
      address,
      connected: isConnected,
      chainId,
      wrongNetwork,
      contractAddress: CONTRACT_ADDRESS,
      publicClient,
      // will
      createWill,
      updateWill,
      pingWill,
      deleteWill,
      // media
      addMedia,
      removeMedia,
      // custodians
      addCustodian,
      removeCustodian,
      confirmDeath,
      revokeDeathConfirmation,
      // beneficiaries
      addBeneficiary,
      removeBeneficiary,
      claimInheritance,
      registerRecipientKey,
      // tokens
      approveToken,
      allowanceOf,
      depositToken,
      withdrawToken,
      claimToken,
      // teardown
      sweepTokenVault,
      closeEstate,
      closeEstateFully,
    }),
    [
      address,
      isConnected,
      chainId,
      wrongNetwork,
      publicClient,
      createWill,
      updateWill,
      pingWill,
      deleteWill,
      addMedia,
      removeMedia,
      addCustodian,
      removeCustodian,
      confirmDeath,
      revokeDeathConfirmation,
      addBeneficiary,
      removeBeneficiary,
      claimInheritance,
      registerRecipientKey,
      approveToken,
      allowanceOf,
      depositToken,
      withdrawToken,
      claimToken,
      sweepTokenVault,
      closeEstate,
      closeEstateFully,
    ]
  );
}

export type VaultApi = ReturnType<typeof useVault>;
export type { Address, Hex };
