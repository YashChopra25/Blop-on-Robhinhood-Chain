"use client";

import { useEffect, useState, FC } from "react";

export const VaultLoader: FC = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const intervals = [600, 1200, 1800];
    const timers = intervals.map((time, idx) =>
      setTimeout(() => setStep(idx + 1), time)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[400px] w-full py-12 px-4 relative">
      {/* Glow aura background */}
      <div className="absolute size-72 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(108,70,255,0.18),transparent_70%)] blur-3xl pointer-events-none" />
      
      <div className="max-w-md w-full rounded-2xl border border-border-strong bg-surface p-8 flex flex-col items-center gap-6 text-center">
        {/* Glowing Holographic Key/Lock Element */}
        <div className="relative size-24 flex items-center justify-center">
          {/* Outer rotating orbit ring */}
          <div className="absolute inset-0 rounded-full border border-dashed border-[var(--accent)]/30 animate-spin-slow" />
          
          {/* Middle pulse ring */}
          <div className="absolute inset-3 rounded-full border border-border bg-white/[0.02]" />
          <div className="absolute inset-3 rounded-full bg-[var(--accent)]/5 animate-pulse-ring" />
          
          {/* Core Lock SVG Icon */}
          <div className="relative size-12 rounded-xl bg-white/[0.03] border border-border flex items-center justify-center shadow-lg">
            <svg 
              className="size-6 text-[var(--neon)] animate-pulse" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" 
              />
            </svg>
          </div>
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Accessing Inheritance Vault
          </h3>
          <p className="text-xs text-muted max-w-[280px] mx-auto leading-relaxed">
            Synchronizing with Robinhood Chain state and validating encrypted document signatures.
          </p>
        </div>

        {/* Cryptographic Step Logs */}
        <div className="w-full bg-black/40 border border-border rounded-xl p-4 font-mono text-[10px] text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted">CONNECTING_SOLANA_RPC</span>
            <span className={step >= 1 ? "text-[var(--neon)]" : "text-muted animate-pulse"}>
              {step >= 1 ? "● DONE" : "○ ACTIVE"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">LOOKUP_WILL_REGISTRY</span>
            <span className={step >= 2 ? "text-[var(--neon)]" : step >= 1 ? "text-muted animate-pulse" : "text-white/20"}>
              {step >= 2 ? "● DONE" : step >= 1 ? "○ ACTIVE" : "◌ PENDING"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">RESOLVING_SEALED_IPFS</span>
            <span className={step >= 3 ? "text-[var(--neon)]" : step >= 2 ? "text-muted animate-pulse" : "text-white/20"}>
              {step >= 3 ? "● DONE" : step >= 2 ? "○ ACTIVE" : "◌ PENDING"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
