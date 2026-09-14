import { FC } from "react";

export const LifecycleFlow: FC = () => {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.01] p-5 glass relative overflow-hidden">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] mb-5">
        Will Execution Lifecycle
      </h3>

      <div className="relative flex flex-col gap-8 pl-8">
        {/* Animated connecting line */}
        <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[var(--neon)] via-[var(--accent)] to-[var(--danger)]">
          <div className="absolute top-0 w-full h-1/2 bg-white/60 animate-shimmer" />
        </div>

        {/* Step 1 */}
        <div className="relative group">
          <div className="absolute -left-[27px] top-0.5 size-4 rounded-full border-2 border-[var(--neon)] bg-background flex items-center justify-center shadow-[0_0_8px_var(--neon)]">
            <span className="size-1.5 rounded-full bg-[var(--neon)]" />
          </div>
          <h4 className="text-xs font-semibold text-foreground group-hover:text-[var(--neon)] transition-colors">
            1. Initialize & Seal Will
          </h4>
          <p className="mt-1 text-[11px] text-muted leading-relaxed">
            Will is compiled on-chain. Secure documents are uploaded and pinned
            to IPFS, mapping keys on-chain.
          </p>
        </div>

        {/* Step 2 */}
        <div className="relative group">
          <div className="absolute -left-[27px] top-0.5 size-4 rounded-full border-2 border-[var(--accent)] bg-background flex items-center justify-center shadow-[0_0_8px_var(--accent)]">
            <span className="size-1.5 rounded-full bg-[var(--accent)]" />
          </div>
          <h4 className="text-xs font-semibold text-foreground group-hover:text-[var(--accent)] transition-colors">
            2. Active Check-In
          </h4>
          <p className="mt-1 text-[11px] text-muted leading-relaxed">
            Owner checks in regularly via the app to refresh the on-chain timer.
            The contract will stay locked as long as check-ins are active.
          </p>
        </div>

        {/* Step 3 */}
        <div className="relative group">
          <div className="absolute -left-[27px] top-0.5 size-4 rounded-full border-2 border-amber-400 bg-background flex items-center justify-center shadow-[0_0_8px_rgba(251,191,36,0.5)]">
            <span className="size-1.5 rounded-full bg-amber-400" />
          </div>
          <h4 className="text-xs font-semibold text-foreground group-hover:text-amber-400 transition-colors">
            3. Inactivity Trigger
          </h4>
          <p className="mt-1 text-[11px] text-muted leading-relaxed">
            If owner check-ins cease beyond the inactivity threshold, the
            countdown expires and the will changes status on-chain.
          </p>
        </div>

        {/* Step 4 */}
        <div className="relative group">
          <div className="absolute -left-[27px] top-0.5 size-4 rounded-full border-2 border-sign-red bg-background flex items-center justify-center shadow-[0_0_8px_var(--danger)]">
            <span className="size-1.5 rounded-full bg-[var(--danger)] animate-pulse" />
          </div>
          <h4 className="text-xs font-semibold text-foreground group-hover:text-[var(--danger)] transition-colors">
            4. Custodian Quorum
          </h4>
          <p className="mt-1 text-[11px] text-muted leading-relaxed">
            Authorized custodians confirm the passing of the owner. Quorum
            consensus transitions the contract status to claimable.
          </p>
        </div>

        {/* Step 5 */}
        <div className="relative group">
          <div className="absolute -left-[27px] top-0.5 size-4 rounded-full border-2 border-border-strong bg-background flex items-center justify-center shadow-[0_0_8px_rgba(255,255,255,0.3)]">
            <span className="size-1.5 rounded-full bg-white" />
          </div>
          <h4 className="text-xs font-semibold text-foreground group-hover:text-foreground transition-colors">
            5. Inherit Distribution
          </h4>
          <p className="mt-1 text-[11px] text-muted leading-relaxed">
            Beneficiaries claim their defined percentage and retrieve the sealed
            IPFS documents directly from the secure previewer.
          </p>
        </div>
      </div>
    </div>
  );
};
