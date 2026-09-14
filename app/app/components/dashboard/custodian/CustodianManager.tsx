"use client";
import { sameAddress } from "@/lib/evm/codec";

import { FC, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { useParsedAddress } from "@/hooks/useParsedAddress";
import { Field, Input, TxButton, short } from "../shared/ui";
import { KeyList, type KeyListBadge } from "../shared/KeyList";
import { CustodianQuorumCard } from "./CustodianQuorumCard";
import type { CustodianView } from "@/lib/evm/types";

type CustodianRow = CustodianView;

interface CustodianManagerProps {
  refresh: () => void;
  custodians: CustodianRow[];
  isActive: boolean;
  minApprovals: number;
  approvalsReceived: number;
  /**
   * `will.approvalEpoch`. Kept for display only.
   *
   * On Solana the client had to compare it against each custodian's
   * `approved_epoch` itself, because `revoke_death_confirmation` bumps the epoch
   * rather than rewriting every custodian account. `getCustodians` now applies
   * that comparison on-chain, so `hasApproved` already reads false for a
   * confirmation from a revoked round and the UI cannot get it wrong.
   */
  approvalEpoch: number;
}

export const CustodianManager: FC<CustodianManagerProps> = ({
  refresh,
  custodians,
  isActive,
  minApprovals,
  approvalsReceived,
  approvalEpoch,
}) => {
  const vault = useVault();
  const [addr, setAddr] = useState("");
  const parsed = useParsedAddress(addr);

  const duplicate =
    !!parsed && custodians.some((c) => sameAddress(c.wallet, parsed));
  const isSelf = !!parsed && !!vault.address && sameAddress(parsed, vault.address);

  const problem = !addr
    ? null
    : !parsed
      ? "Not a valid EVM address (expected 0x…)."
      : duplicate
        ? `${short(parsed)} is already a custodian.`
        : null;

  // `remove_custodian` refuses to drop the count below `min_approvals` while
  // any custodian remains — removing down to zero is the one exemption, so the
  // will can still be torn down.
  const removalWouldBreakQuorum =
    custodians.length > 1 && custodians.length - 1 < minApprovals;
  const removeBlockedReason = removalWouldBreakQuorum
    ? `Removing would leave ${custodians.length - 1} custodians, fewer than the ${minApprovals} approvals your will requires. Lower the quorum in Will Settings first.`
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Custodians</h3>
          <p className="mt-0.5 text-xs text-muted">
            The only people who can confirm your passing. They can never read
            your documents or move your tokens.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-white/[0.02] px-3 py-2">
          <ShieldCheck className="size-3.5 text-[var(--accent)]" />
          <span className="font-mono text-xs font-semibold text-[var(--accent)]">
            {custodians.length}{" "}
            {custodians.length === 1 ? "custodian" : "custodians"}
          </span>
        </div>
      </div>

      {/* Quorum and the form share one row so the list stays above the fold. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CustodianQuorumCard
          minApprovals={minApprovals}
          custodianCount={custodians.length}
          approvalsReceived={approvalsReceived}
        />

        <div className="flex h-full flex-col rounded-2xl border border-border bg-white/[0.02] p-5">
          <div className="flex items-center gap-2">
            <UserPlus className="size-3.5 text-muted" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Add a custodian
            </p>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <Field label="Wallet address">
              <Input
                placeholder="e.g. 7H4qB2EYAaXk..."
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                disabled={!isActive}
              />
            </Field>

            {problem && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] leading-relaxed text-red-300">
                {problem}
              </p>
            )}

            {isSelf && !problem && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/85">
                That is your own wallet — its approval is one you can never
                cast.
              </p>
            )}

            <TxButton
              disabled={!isActive || !parsed || !!problem}
              title={
                !isActive
                  ? "Actions are only allowed when the will is active"
                  : ""
              }
              action={() => vault.addCustodian(parsed!)}
              onDone={() => {
                setAddr("");
                refresh();
              }}
            >
              Add custodian
            </TxButton>
          </div>
        </div>
      </div>

      {/* The list is the main event: full width, directly reachable. */}
      <div className="rounded-2xl border border-border bg-white/[0.02] p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
          Custodian list ({custodians.length})
        </h4>
        <KeyList
          items={custodians.map((c) => {
            // A confirmation only counts in the will's current epoch. Reading
            // `hasApproved` alone would keep showing a revoked round as live,
            // contradicting the tally on the quorum card above.
            const confirmed =
              c.hasApproved && c.approvedEpoch === approvalEpoch;
            const staleApproval = c.hasApproved && !confirmed;
            const approvedAt = Number(c.lastApprovedAt);

            const badges: KeyListBadge[] = [
              confirmed
                ? {
                    label: "Confirmed passing",
                    style: "danger",
                    title:
                      "This custodian has confirmed in the current approval round.",
                  }
                : {
                    label: "Awaiting confirmation",
                    style: "neutral",
                  },
            ];
            if (staleApproval) {
              badges.push({
                label: "Revoked round",
                style: "warn",
                title:
                  "This custodian confirmed in an earlier round that you cancelled. It no longer counts.",
              });
            }

            return {
              key: c.wallet,
              wallet: c.wallet,
              badges,
              detail:
                confirmed && approvedAt
                  ? `Confirmed ${new Date(approvedAt * 1000).toLocaleString()}`
                  : undefined,
              removeBlockedReason,
            };
          })}
          onRemove={(wallet) => vault.removeCustodian(wallet)}
          refresh={refresh}
          disabled={!isActive}
          empty="No custodians named. Without at least one, nobody can ever confirm your passing — and no documents or tokens can be added to this will."
        />
      </div>
    </div>
  );
};
