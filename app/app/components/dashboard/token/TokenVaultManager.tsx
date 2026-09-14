"use client";

import { FC } from "react";
import Link from "next/link";
import { Plus, ExternalLink, RefreshCw } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useTokenEscrow, useTokenEscrowRemove } from "@/hooks/useTokenEscrow";
import { Field, Input, ExplorerLink } from "../shared/ui";
import { TokenVaultList } from "./TokenVaultList";
import { UserTokenList } from "./UserTokenList";
import { useDashboard } from "@/hooks/useDashboard";
import type { TokenVaultView } from "@/lib/evm/types";
interface TokenVaultManagerProps {
  refresh: () => void;
  tokenVaults: TokenVaultView[];
  isActive: boolean;
}

export const TokenVaultManager: FC<TokenVaultManagerProps> = ({
  refresh,
  tokenVaults,
  isActive,
}) => {
  const vault = useVault();
  // H1: the program refuses to escrow into a will whose quorum can never be
  // met, so the form is disabled on exactly the condition the guard checks
  // rather than letting the user discover it as a failed transaction. The same
  // readiness object drives the checklist shown above this panel.
  const { readiness } = useDashboard();
  const canEscrow = isActive && readiness.canAddAssets;

  const {
    vaultDisplays,
    loading: loadingBalances,
    refresh: refreshBalances,
  } = useTokenBalances(tokenVaults);

  const refreshAll = () => {
    refresh();
    refreshBalances();
  };

  // `depositToken` approves the allowance first when it is short — the extra
  // step ERC-20 needs and SPL did not, handled inside the hook.
  const escrow = useTokenEscrow(vault.depositToken, refreshAll, vault.address);

  const escrowRemove = useTokenEscrowRemove(vault.withdrawToken, refreshAll);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 w-full items-start">
      {/* Deposit Form */}
      <div className="md:col-span-2 rounded-2xl border border-border bg-white/[0.02] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Escrow New ERC-20 Token</h3>
          <p className="text-[11px] text-muted mt-0.5">Register and deposit tokens under your digital will.</p>
        </div>

        <div className="space-y-3.5">
          <Field label="ERC-20 Token Contract Address">
            <div className="relative">
              <Input
                placeholder="0x…"
                value={escrow.tokenAddress}
                onChange={(e) => escrow.setTokenAddress(e.target.value)}
                disabled={!canEscrow || escrow.submitting}
                className="w-full pr-8"
              />
              {escrow.checking && (
                <RefreshCw className="absolute right-3 top-3 size-4 animate-spin text-muted" />
              )}
            </div>
          </Field>

          {/* Quick-select for topping up a token already escrowed */}
          <UserTokenList
            tokens={vaultDisplays}
            onSelect={(token) => escrow.setTokenAddress(token)}
            selectedToken={escrow.tokenAddress}
          />

          {!readiness.canAddAssets && (
            <div className="rounded-lg bg-[var(--warn)]/10 border border-[var(--warn)]/20 p-3 text-xs text-[var(--warn)] space-y-1">
              <span className="font-semibold block">Setup Required</span>
              <p className="text-[10px] opacity-80 leading-relaxed">
                {readiness.blockers[0]?.detail}
              </p>
              <Link
                href={readiness.blockers[0]?.href ?? "/dashboard/custodians"}
                className="inline-flex items-center gap-1 text-[10px] font-semibold underline"
              >
                {readiness.blockers[0]?.cta ?? "Add custodian"}
              </Link>
            </div>
          )}

          {escrow.isValidToken && (
            <div className="rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20 p-2 text-xs text-[var(--accent)] flex items-center justify-between">
              <span>Token Resolved:</span>
              <span className="font-semibold">{escrow.symbol} ({escrow.decimals} decimals)</span>
            </div>
          )}

          <Field label="Amount to Escrow">
            <Input
              type="number"
              min={0}
              step="any"
              placeholder="0.0"
              value={escrow.amount}
              onChange={(e) => escrow.setAmount(e.target.value)}
              disabled={!canEscrow || !escrow.isValidToken || escrow.submitting}
            />
          </Field>

          <button
            onClick={escrow.submitEscrow}
            disabled={!canEscrow || !escrow.isValidToken || escrow.submitting || !escrow.amount}
            className="w-full flex h-10 items-center justify-center rounded-lg px-4 text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-foreground disabled:opacity-50 transition-all gap-1.5 cursor-pointer"
          >
            {escrow.submitting ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {escrow.submitting ? "Confirming..." : "Escrow Token"}
          </button>

          {escrow.error && <p className="text-[11px] text-red-400 mt-1">{escrow.error}</p>}
          {escrow.successHash && (
            <p className="text-[11px] text-emerald-400 mt-1">
              Confirmed!{" "}
              <ExplorerLink
                value={escrow.successHash}
                kind="tx"
                className="inline-flex items-center gap-0.5 font-semibold"
              >
                View Tx <ExternalLink className="size-3" />
              </ExplorerLink>
            </p>
          )}
        </div>
      </div>
      {/* Escrowed List */}
      <TokenVaultList
        tokenVaultsCount={tokenVaults.length}
        vaultDisplays={vaultDisplays}
        loadingBalances={loadingBalances}
        refreshBalances={refreshBalances}
        hasOwnerKey={!!vault.address}
        isActive={isActive}
        onRemove={escrowRemove.submitRemove}
        removing={escrowRemove.removing}
        removeError={escrowRemove.error}
        removeSuccessHash={escrowRemove.successHash}
      />
    </div>
  );
};
