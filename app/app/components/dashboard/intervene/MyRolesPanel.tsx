"use client";

import { FC } from "react";
import { useMyRoles } from "@/hooks/useMyRoles";
import { RoleWillList } from "./RoleWillList";

interface MyRolesPanelProps {
  selectedOwner: string | null;
  onSelect: (owner: string) => void;
}

export const MyRolesPanel: FC<MyRolesPanelProps> = ({
  selectedOwner,
  onSelect,
}) => {
  const { data, loading, error } = useMyRoles();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Wills your connected wallet is attached to. Select one to load its status
        and act on it.
      </p>
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <RoleWillList
          title="As Beneficiary"
          emptyLabel="No wills name you as a beneficiary."
          loading={loading}
          wills={data.beneficiaryWills}
          selectedOwner={selectedOwner}
          onSelect={onSelect}
        />
        <RoleWillList
          title="As Custodian"
          emptyLabel="No wills name you as a custodian."
          loading={loading}
          wills={data.custodianWills}
          selectedOwner={selectedOwner}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
};
