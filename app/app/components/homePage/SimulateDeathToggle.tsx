import { FC, useState } from "react";
import { ScrambleText } from "@/app/components/fx/ScrambleText";

interface SimulateDeathToggleProps {
  active: boolean;
  onTrigger: () => void;
  disabled: boolean;
}

export const SimulateDeathToggle: FC<SimulateDeathToggleProps> = ({
  active,
  onTrigger,
  disabled,
}) => {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (disabled || active) return;
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 2500);
      return;
    }
    setConfirming(false);
    onTrigger();
  };

  const label = active
    ? "Custodians confirmed"
    : confirming
      ? "Tap again to confirm"
      : "Simulate death";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || active}
      className={`inline-flex h-9 items-center gap-2 border px-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
        active
          ? "border-danger/50 text-danger"
          : confirming
            ? "border-warn/50 text-warn"
            : "border-border-strong text-muted hover:border-danger/60 hover:text-danger"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      aria-pressed={active}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-danger" : "bg-faint"}`}
      />
      {/* Re-keyed so a label change restarts the shred rather than resuming a
          run against the previous string. */}
      <ScrambleText key={label} text={label} trigger="mount" speed={40} />
    </button>
  );
};
