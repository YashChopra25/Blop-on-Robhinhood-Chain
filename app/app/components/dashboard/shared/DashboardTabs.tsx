import { FC } from "react";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

export const TabButton: FC<TabButtonProps> = ({ active, onClick, label }) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 border whitespace-nowrap ${
        active
          ? "bg-white/[0.06] border-border-strong text-foreground shadow-lg shadow-black/20"
          : "border-transparent text-muted hover:text-foreground hover:bg-white/[0.02]"
      }`}
    >
      {label}
    </button>
  );
};

interface PlaceholderTabProps {
  setActiveTab: (tab: string) => void;
}

export const PlaceholderTab: FC<PlaceholderTabProps> = ({ setActiveTab }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-border bg-black/10">
      <div className="p-3 rounded-full bg-white/[0.02] border border-border mb-3 text-muted">
        <svg
          className="size-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h4 className="text-sm font-semibold text-foreground">No Active Will Found</h4>
      <p className="mt-1 max-w-sm text-xs text-muted leading-relaxed">
        You need to initialize your digital will before you can manage sealed
        media, custodians, or beneficiaries.
      </p>
      <button
        onClick={() => setActiveTab("settings")}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg px-4 text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-foreground transition-colors"
      >
        Go to Settings & Create
      </button>
    </div>
  );
};
