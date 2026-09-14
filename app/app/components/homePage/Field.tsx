import { FC, ReactNode } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
}

export const Field: FC<FieldProps> = ({ label, children }) => {
  return (
    <label className="block border border-border px-3.5 py-3 transition-colors focus-within:border-border-strong">
      <div className="label-mono">{label}</div>
      <div className="mt-2 flex items-center gap-2">{children}</div>
    </label>
  );
};
