"use client";

import { useMemo, useState, FC } from "react";
import { getAddress, isAddress } from "viem";
import { sameAddress } from "@/lib/evm/codec";
import { useVault } from "@/hooks/useVault";
import { useWill } from "@/hooks/useWill";
import { willStatusLabel } from "@/lib/utils";
import { Section, Field, Input } from "../shared/ui";
import { ActPanelContent } from "./ActPanelContent";
import { MyRolesPanel } from "./MyRolesPanel";

interface ActPanelProps {
  noWrapper?: boolean;
}

export const ActPanel: FC<ActPanelProps> = ({ noWrapper = false }) => {
  const vault = useVault();
  const me = vault.address;
  const [ownerStr, setOwnerStr] = useState("");

  // `getAddress` both validates and checksums, replacing the `new PublicKey()`
  // constructor-throws idiom the Solana client used for the same purpose.
  const owner = useMemo(() => {
    const raw = ownerStr.trim();
    return raw && isAddress(raw) ? getAddress(raw) : null;
  }, [ownerStr]);

  const { data, loading, error, refresh } = useWill(owner);
  const will = data?.will ?? null;

  const myCustodian = useMemo(
    () => data?.custodians.find((c) => me && sameAddress(c.wallet, me)),
    [data, me]
  );
  const myBeneficiary = useMemo(
    () => data?.beneficiaries.find((b) => me && sameAddress(b.wallet, me)),
    [data, me]
  );

  const status = will ? willStatusLabel(will.status) : null;
  const claimable = status === "claimable";

  const content = (
    <>
      {me && (
        <MyRolesPanel selectedOwner={owner ?? null} onSelect={setOwnerStr} />
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-black/10 p-4">
        <Field label="Or enter a will owner's address manually">
          <Input
            placeholder="0x…"
            value={ownerStr}
            onChange={(e) => setOwnerStr(e.target.value)}
          />
        </Field>
      </div>

      {owner && loading && (
        <div className="flex items-center gap-2 text-xs text-muted py-3">
          <div className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
          <span>Searching Robinhood Chain for active wills…</span>
        </div>
      )}
      {ownerStr.trim() && !owner && (
        <p className="text-xs text-red-400 font-mono py-1">Invalid address format (expected 0x…).</p>
      )}
      {error && <p className="text-xs text-red-400 font-mono py-1">{error}</p>}

      {owner && data && !will && (
        <div className="rounded-lg border border-border bg-black/20 p-4 text-center">
          <p className="text-xs text-muted">No active will found for this address.</p>
        </div>
      )}

      {will && (
        <ActPanelContent
          data={data!}
          owner={owner!}
          me={me ?? null}
          status={status}
          claimable={claimable}
          myCustodian={myCustodian}
          myBeneficiary={myBeneficiary}
          refresh={refresh}
        />
      )}
    </>
  );

  if (noWrapper) {
    return <div className="flex flex-col gap-5">{content}</div>;
  }

  return (
    <Section
      title="Intervene or Claim inheritance"
      subtitle="Are you a named custodian or a beneficiary? Enter the will owner's address to view contract status, confirm passing, or claim files."
    >
      {content}
    </Section>
  );
};
