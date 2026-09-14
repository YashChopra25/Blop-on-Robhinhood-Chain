"use client";

import { FC } from "react";
import { useDemoState, shorten, formatDuration } from "@/hooks/useDemoState";
import { Field } from "./Field";
import { SimulateDeathToggle } from "./SimulateDeathToggle";
import { DemoInfo } from "./DemoInfo";
import { ScrambleText } from "@/app/components/fx/ScrambleText";

export const Demo: FC = () => {
  const {
    state,
    progress,
    remainingMs,
    statusMeta,
    connect,
    ping,
    simulateDeath,
    claim,
    reset,
    setBeneficiary,
    setAmount,
    setIntervalDays,
  } = useDemoState();

  const armed = state.status === "triggered" || state.status === "claimed";
  const countdown = armed
    ? "00d 00h 00m 00s"
    : state.lastPingMs
      ? formatDuration(remainingMs)
      : `${state.intervalDays.toString().padStart(2, "0")}d 00h 00m 00s`;

  return (
    <section id="demo" className="border-b border-border">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr]">
        <div className="border-b border-border px-5 py-12 sm:px-8 sm:py-16 lg:border-b-0 lg:border-r">
          <DemoInfo log={state.log} />
        </div>

        <div className="px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex items-center justify-between border border-border px-4 py-3">
            <div>
              <div className="label-mono">Wallet</div>
              <div className="mt-1.5 font-mono text-sm">
                {state.connected ? shorten(state.wallet) : "not connected"}
              </div>
            </div>
            {state.connected ? (
              <div className="text-right">
                <div className="label-mono">Sealed</div>
                <div className="mt-1.5 font-mono text-sm">8 docs · IPFS</div>
              </div>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={state.connecting}
                className="inline-flex h-9 items-center px-3.5 text-[12px] btn-primary disabled:opacity-60"
              >
                <ScrambleText
                  key={state.connecting ? "c" : "i"}
                  text={state.connecting ? "Connecting…" : "Connect wallet"}
                  trigger="mount"
                  speed={44}
                  noiseClassName="opacity-50"
                />
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Beneficiary address">
              <input
                type="text"
                value={state.beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                spellCheck={false}
                className="w-full bg-transparent font-mono text-[12px] outline-none placeholder:text-faint"
                placeholder="9xVu…"
              />
            </Field>
            <Field label="Allocation (%)">
              <input
                type="text"
                inputMode="decimal"
                value={state.amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent font-mono text-sm outline-none"
              />
              <span className="label-mono shrink-0">of estate</span>
            </Field>
            <Field label="Inactivity window">
              <div className="flex w-full items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={365}
                  value={state.intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="w-14 text-right font-mono text-sm tabular-nums">
                  {state.intervalDays}d
                </span>
              </div>
            </Field>
            <Field label="Custodian quorum">
              <div className="flex w-full items-center justify-between">
                <span className="font-mono text-sm">2 of 3</span>
                <span className="label-mono inline-flex items-center gap-1.5 text-neon">
                  <span className="size-1.5 rounded-full bg-neon" />
                  required
                </span>
              </div>
            </Field>
          </div>

          <div className="mt-4 border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${statusMeta.border} ${statusMeta.text}`}
                >
                  <span className={`size-1.5 rounded-full ${statusMeta.dot}`} />
                  {statusMeta.label}
                </span>
                <span className="label-mono">
                  {state.lastPingMs
                    ? `checked in ${new Date(state.lastPingMs).toLocaleTimeString([], { hour12: false })}`
                    : "no check-ins yet"}
                </span>
              </div>
              <SimulateDeathToggle
                active={armed}
                onTrigger={simulateDeath}
                disabled={!state.connected || state.status === "claimed"}
              />
            </div>

            <div className="mt-6 flex items-end justify-between gap-4">
              <div>
                <p className="label-mono">Time until claimable</p>
                <p className="mt-2 font-mono text-2xl tabular-nums sm:text-3xl">
                  {countdown}
                </p>
              </div>
              <div className="label-mono hidden text-right sm:block">
                window {state.intervalDays}d
              </div>
            </div>

            <div className="mt-4 h-1.5 w-full bg-[rgba(233,229,220,0.07)]">
              <div
                className="h-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.max(progress * 100, state.lastPingMs ? 3 : 0)}%`,
                  background: armed
                    ? "var(--danger)"
                    : state.status === "at-risk"
                      ? "var(--warn)"
                      : "var(--neon)",
                }}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={ping}
              disabled={!state.connected || state.pinging || armed}
              className="inline-flex h-11 items-center px-5 text-sm btn-primary disabled:opacity-50"
            >
              <ScrambleText
                key={state.pinging ? "s" : "c"}
                text={state.pinging ? "Signing…" : "Check in"}
                trigger="mount"
                speed={44}
                noiseClassName="opacity-50"
              />
            </button>

            {state.status === "triggered" && (
              <button
                type="button"
                onClick={claim}
                disabled={state.claiming}
                className="inline-flex h-11 items-center border border-danger px-5 text-sm text-danger transition-colors hover:bg-danger hover:text-background disabled:opacity-50"
              >
                <ScrambleText
                  text={state.claiming ? "Claiming…" : "Claim as beneficiary"}
                  speed={44}
                />
                <span className="ml-2">↗</span>
              </button>
            )}

            {state.status === "claimed" && (
              <span className="inline-flex items-center gap-2 font-mono text-[12px] text-neon">
                <span>✓</span>
                <ScrambleText
                  text="Documents unlocked for beneficiary"
                  trigger="mount"
                  speed={40}
                />
              </span>
            )}

            <button
              type="button"
              onClick={reset}
              className="ml-auto label-mono transition-colors hover:text-foreground"
            >
              <ScrambleText text="Reset simulation" speed={40} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
