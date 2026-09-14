"use client";

import { FC, useCallback, useState } from "react";
import type { Address } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { useVaultIdentity } from "@/hooks/useVaultSession";
import { hasEncryptionKey, hexToKey } from "@/lib/evm/codec";
import { vaultInheritanceAbi } from "@/lib/evm/abi";
import { CONTRACT_ADDRESS } from "@/lib/evm/config";
import { humanizeError } from "@/lib/utils";
import type { BeneficiaryView } from "@/lib/evm/types";

/**
 * Lets an heir publish the encryption key their inherited documents are sealed
 * to (C5).
 *
 * This is a prerequisite, not a nicety: the owner seals each document to the
 * recipients that exist *at upload time*, so an heir who registers late cannot
 * open anything uploaded before they did. The card therefore states that
 * plainly rather than presenting registration as optional.
 *
 * The secret half is derived from a wallet signature and never leaves the
 * browser — the server, the pinning service and the chain only ever see the
 * public half.
 */

interface RecipientKeyCardProps {
  /** Owner of the will this heir is named on. */
  ownerAddress: Address;
}

export const RecipientKeyCard: FC<RecipientKeyCardProps> = ({
  ownerAddress,
}) => {
  const vault = useVault();
  const { unlock } = useVaultIdentity();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const me = vault.address ?? null;

  const client = vault.publicClient;

  // One `getBeneficiary` call replaces the Solana version's three steps (derive
  // the will PDA, derive the beneficiary PDA from it, `fetchNullable` the
  // account). The heir is a mapping key here, so there is nothing to derive —
  // and a non-existent record reads as `exists: false` rather than as a null
  // account.
  const registered = useQuery({
    queryKey: ["recipientKey", ownerAddress, me],
    enabled: !!me && !!client,
    queryFn: async () => {
      if (!me || !client) return null;
      const view = (await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: vaultInheritanceAbi,
        functionName: "getBeneficiary",
        args: [ownerAddress, me],
      })) as unknown as BeneficiaryView;
      if (!view.exists || !hasEncryptionKey(view.encryptionPubkey)) return null;
      return hexToKey(view.encryptionPubkey);
    },
  });

  const onRegister = useCallback(async () => {
    setBusy(true);
    const id = toast.loading("Deriving your document key…");
    try {
      const identity = await unlock();
      toast.loading("Publishing your public key on-chain…", { id });
      await vault.registerRecipientKey(ownerAddress, identity.publicKey);
      toast.success(
        "Key registered. Documents uploaded from now on can be opened by you.",
        { id }
      );
      await queryClient.invalidateQueries({
        queryKey: ["recipientKey", ownerAddress, me],
      });
    } catch (e) {
      toast.error(humanizeError(e), { id });
    } finally {
      setBusy(false);
    }
  }, [unlock, vault, ownerAddress, queryClient, me]);

  if (!me || registered.isLoading) return null;

  const hasKey = !!registered.data;

  return (
    <div
      className={`rounded-xl border p-4 ${
        hasKey
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-amber-500/25 bg-amber-500/5"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          {hasKey ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          ) : (
            <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-400" />
          )}
          <div>
            <p
              className={`text-sm font-medium ${
                hasKey ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {hasKey
                ? "Your document key is registered"
                : "Register your document key"}
            </p>
            <p
              className={`mt-1 max-w-xl text-xs leading-relaxed ${
                hasKey ? "text-emerald-200/75" : "text-amber-200/80"
              }`}
            >
              {hasKey
                ? "Documents this vault owner uploads are sealed so that you can open them. Nobody else — not this app, not the storage provider — can."
                : "Documents are encrypted for specific recipients when they are uploaded. Until you register, anything uploaded to this vault can never be opened by you, even after you inherit it."}
            </p>
          </div>
        </div>

        {!hasKey && (
          <button
            type="button"
            onClick={onRegister}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/90 px-4 text-xs font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Registering…" : "Register key"}
          </button>
        )}
      </div>
    </div>
  );
};
