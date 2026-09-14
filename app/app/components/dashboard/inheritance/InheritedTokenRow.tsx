"use client";

import { FC } from "react";
import type { Address } from "viem";
import { Coins } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { TxButton, short } from "../shared/ui";
import type { InheritedTokenDisplay } from "@/app/types/inheritance.types";

interface InheritedTokenRowProps {
  owner: Address;
  token: InheritedTokenDisplay;
  /**
   * Whether the program would accept a claim right now. `claim_token` calls
   * `require_claims_open`, so during the owner's grace period this button would
   * only ever produce a failed transaction.
   */
  canClaim: boolean;
  refresh: () => void;
}

export const InheritedTokenRow: FC<InheritedTokenRowProps> = ({
  owner,
  token,
  canClaim,
  refresh,
}) => {
  const vault = useVault();
  const nothingToClaim = Number(token.myShare) <= 0;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-black/20 px-3.5 py-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Coins className="size-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <span className="font-semibold text-foreground">{token.symbol}</span>{" "}
            <span className="text-[10px] text-muted">{token.name}</span>
            <span className="block text-[10px] text-muted font-mono">
              Mint: {short(token.token)}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-semibold text-accent">
            {token.myShare} {token.symbol}
          </div>
          <div className="text-[10px] text-muted">
            your share of {token.totalEscrowed}
          </div>
        </div>
      </div>

      {token.claimed ? (
        <p className="text-[11px] font-medium text-neon">
          Claimed {token.claimedAmount} {token.symbol} — sent to your wallet.
        </p>
      ) : nothingToClaim ? (
        <p className="text-[11px] text-muted">
          Your allocation is 0% for tokens — nothing to claim here.
        </p>
      ) : !canClaim ? (
        <p className="text-[11px] text-muted">
          Locked until the owner&apos;s revocation window ends.
        </p>
      ) : (
        <TxButton
          action={() => vault.claimToken(owner, token.token)}
          onDone={refresh}
        >
          Claim {token.myShare} {token.symbol}
        </TxButton>
      )}
    </li>
  );
};
