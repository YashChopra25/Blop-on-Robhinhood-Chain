"use client";

import { FC } from "react";
import { Coins, Check } from "lucide-react";
import type { TokenVaultDisplay } from "@/app/types/token.types";

/**
 * Quick-select for a token address, over the tokens this will ALREADY escrows.
 *
 * The Solana version listed every SPL token in the connected wallet, from
 * `getParsedTokenAccountsByOwner` — the chain could enumerate token accounts by
 * owner, so "pick one of your holdings" was a single RPC call.
 *
 * EVM has no such call: an ERC-20 balance is a mapping entry inside each token
 * contract, so nothing can list "every token this wallet holds" without an
 * external indexer (see `useTokenBalances`). Rather than depend on one, this
 * lists the will's existing escrows instead, which the contract DOES enumerate.
 *
 * That covers the case the picker actually served — topping up a token already
 * in the vault, without re-pasting a 42-character address. A first-time escrow
 * is typed or pasted into the field above; the balance shown here is the user's
 * own, so they can see what is left to add.
 */

interface UserTokenListProps {
  tokens: TokenVaultDisplay[];
  onSelect: (token: string) => void;
  selectedToken: string;
}

export const UserTokenList: FC<UserTokenListProps> = ({
  tokens,
  onSelect,
  selectedToken,
}) => {
  if (tokens.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-black/5 p-4 text-center">
        <Coins className="size-6 text-muted mx-auto opacity-30 mb-1" />
        <p className="text-[10px] text-muted">
          No tokens escrowed yet. Paste an ERC-20 contract address above to add
          the first one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-[10px] text-muted block uppercase tracking-wider font-semibold">
        Top up an existing escrow
      </span>
      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 subtle-scrollbar">
        {tokens.map((t) => {
          const isSelected = selectedToken.toLowerCase() === t.token.toLowerCase();
          return (
            <div
              key={t.token}
              onClick={() => onSelect(t.token)}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 cursor-pointer group ${
                isSelected
                  ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 text-foreground"
                  : "bg-black/15 border-border hover:border-border-strong text-muted hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`size-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                  isSelected ? "bg-[var(--accent)]/20 text-foreground" : "bg-surface text-[var(--accent)] group-hover:bg-surface-2"
                }`}>
                  {t.symbol.substring(0, 3)}
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-semibold">{t.symbol}</h4>
                  <span className="text-[9px] opacity-60 font-mono">
                    {t.token.slice(0, 6)}…{t.token.slice(-4)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <div className="text-xs font-mono font-semibold text-foreground">
                    {parseFloat(t.userBalance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })}
                  </div>
                  <span className="text-[8px] opacity-50 block">Your balance</span>
                </div>
                <div className={`size-5 rounded-full border flex items-center justify-center transition-all ${
                  isSelected
                    ? "bg-[var(--accent)] border-[var(--accent)] text-foreground"
                    : "border-border group-hover:border-border-strong text-transparent"
                }`}>
                  <Check className="size-3" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
