"use client";

import { FC, useState } from "react";
import { useVault } from "@/hooks/useVault";
import { Field, Input, TxButton } from "../shared/ui";

interface CreateWillFormProps {
  refresh: () => void;
}

export const CreateWillForm: FC<CreateWillFormProps> = ({ refresh }) => {
  const vault = useVault();
  const [days, setDays] = useState("365");
  const [minApproval, setMinApproval] = useState("1");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Create your digital will
        </h3>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          Start securing your digital legacy. Your will is stored on Robinhood
          Chain under your own wallet address.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-black/20 p-5">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          How it works
        </h4>
        <p className="mt-2 text-xs text-muted leading-relaxed">
          When your account goes inactive for longer than your threshold,
          named custodians can confirm your passing. Once the threshold is met,
          heirs (beneficiaries) can claim their allocated shares and unlock your
          sealed IPFS documents.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Inactivity threshold (days)">
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="e.g. 365"
          />
        </Field>
        <Field label="Required custodian approvals">
          <Input
            type="number"
            min={1}
            value={minApproval}
            onChange={(e) => setMinApproval(e.target.value)}
            placeholder="e.g. 2"
          />
        </Field>
      </div>
      <div className="mt-2">
        <TxButton
          action={() =>
            vault.createWill(
              Math.max(1, Number(days)) * 86_400,
              Math.max(1, Number(minApproval))
            )
          }
          onDone={refresh}
        >
          Create will on-chain
        </TxButton>
      </div>
    </div>
  );
};
