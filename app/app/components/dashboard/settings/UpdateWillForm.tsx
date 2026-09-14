"use client";

import { FC, useState } from "react";
import { useVault } from "@/hooks/useVault";
import { useDashboard } from "@/hooks/useDashboard";
import { Field, Input, TxButton } from "../shared/ui";
import { humanizeThreshold } from "./CurrentWillSettings";

interface UpdateWillFormProps {
  refresh: () => void;
  isActive: boolean;
}

const SECS_PER_DAY = 86_400;

export const UpdateWillForm: FC<UpdateWillFormProps> = ({
  refresh,
  isActive,
}) => {
  const vault = useVault();
  const { data } = useDashboard();
  const will = data?.will ?? null;

  // `inactivityThreshold` is a uint64 `bigint`; the form works in plain numbers.
  const currentSecs = Number(will?.inactivityThreshold ?? 0);
  const currentDays = currentSecs ? currentSecs / SECS_PER_DAY : 0;
  const currentMinApprovals = will?.minApprovals ?? 0;

  /**
   * `null` means "the owner has not touched this field", in which case the
   * input shows whatever is on-chain right now. Storing the edit rather than
   * the value is what lets a background refresh (or a completed update) flow
   * straight into the form without a state-sync effect.
   */
  const [daysEdit, setDaysEdit] = useState<string | null>(null);
  const [minApprovalEdit, setMinApprovalEdit] = useState<string | null>(null);

  const days = daysEdit ?? String(currentDays);
  const minApproval = minApprovalEdit ?? String(currentMinApprovals);

  const nextSecs = days === "" ? null : Math.round(Number(days) * SECS_PER_DAY);
  const nextMinApprovals = minApproval === "" ? null : Number(minApproval);

  // Only send what actually changed: `update_will` treats a null argument as
  // "leave this field alone", and re-sending an identical value would be a
  // transaction that pays fees to write nothing.
  const thresholdChanged = nextSecs !== null && nextSecs !== currentSecs;
  const approvalsChanged =
    nextMinApprovals !== null && nextMinApprovals !== currentMinApprovals;
  const dirty = thresholdChanged || approvalsChanged;

  const invalid =
    (nextSecs !== null && nextSecs < 1) ||
    (nextMinApprovals !== null && nextMinApprovals < 1);

  const revert = () => {
    setDaysEdit(null);
    setMinApprovalEdit(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Inactivity threshold (days)">
            <Input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDaysEdit(e.target.value)}
              disabled={!isActive}
            />
          </Field>
          <p className="mt-1 text-[11px] text-muted">
            Currently{" "}
            <span className="text-white/80">
              {humanizeThreshold(currentSecs)}
            </span>
            {thresholdChanged && nextSecs !== null && nextSecs >= 1 && (
              <>
                {" → "}
                <span className="text-[var(--accent)]">
                  {humanizeThreshold(nextSecs)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex-1">
          <Field label="Required custodian approvals">
            <Input
              type="number"
              min={1}
              value={minApproval}
              onChange={(e) => setMinApprovalEdit(e.target.value)}
              disabled={!isActive}
            />
          </Field>
          <p className="mt-1 text-[11px] text-muted">
            Currently{" "}
            <span className="text-white/80">
              {currentMinApprovals} of {will?.custodianCount ?? 0}{" "}
              {will?.custodianCount === 1 ? "custodian" : "custodians"}
            </span>
          </p>
        </div>

        <TxButton
          disabled={!isActive || !dirty || invalid}
          title={
            !isActive
              ? "Actions are only allowed when the will is active"
              : !dirty
                ? "Change a value first"
                : ""
          }
          action={() =>
            vault.updateWill(
              thresholdChanged ? nextSecs : null,
              approvalsChanged ? nextMinApprovals : null,
            )
          }
          onDone={() => {
            revert();
            refresh();
          }}
        >
          Update Settings
        </TxButton>
      </div>

      {dirty && (
        <button
          type="button"
          onClick={revert}
          className="self-start text-[11px] font-semibold text-muted underline hover:text-foreground"
        >
          Revert to current values
        </button>
      )}

      {/* `min_approvals` above `custodian_count` is accepted by `update_will`,
          but it makes the will unable to take on any new asset until more
          custodians are named — worth saying before the transaction, not after. */}
      {approvalsChanged &&
        nextMinApprovals !== null &&
        nextMinApprovals > (will?.custodianCount ?? 0) && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/85">
            {nextMinApprovals} approvals is more than the{" "}
            {will?.custodianCount ?? 0}{" "}
            {will?.custodianCount === 1 ? "custodian" : "custodians"} you have
            named. Until you add more, documents and tokens cannot be added to
            this will.
          </p>
        )}
    </div>
  );
};
