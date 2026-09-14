"use client";

import { useState, useCallback, type ReactNode } from "react";

export { explorerAddressUrl, explorerTxUrl, humanizeError, short } from "@/lib/utils";
import { explorerAddressUrl, explorerTxUrl, humanizeError, short, HAS_EXPLORER } from "@/lib/utils";
import { ScrambleText } from "@/app/components/fx/ScrambleText";

/**
 * What a transaction action may return.
 *
 * `useVault` returns `{ hash, blockNumber }` from the receipt, where the Solana
 * client returned a bare signature string. Accepting both keeps every call site
 * unchanged, and `void` covers actions (like an approval step) that have nothing
 * to link to.
 */
export type TxActionResult = { hash: string } | string | void;

function hashOf(result: TxActionResult): string | undefined {
  if (!result) return undefined;
  return typeof result === "string" ? result : result.hash;
}

/**
 * A link to a transaction or address on the chain's block explorer.
 *
 * Always use this instead of `<a href={explorerTxUrl(...)}>`. Local Anvil has no
 * explorer, so `explorerUrl()` returns "" there — and an anchor with `href=""`
 * resolves to the CURRENT page, so clicking "view tx" silently reloaded the
 * dashboard instead of opening anything. When there is no explorer this renders
 * a click-to-copy hash instead, which is the useful thing to offer locally.
 */
export function ExplorerLink({
  value,
  kind = "tx",
  children,
  className = "",
}: {
  value: string;
  kind?: "tx" | "address";
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (HAS_EXPLORER) {
    const href = kind === "tx" ? explorerTxUrl(value) : explorerAddressUrl(value);
    return (
      <a
        className={`underline ${className}`}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {children ?? short(value)}
      </a>
    );
  }

  return (
    <button
      type="button"
      title={`${value} — click to copy (this chain has no block explorer)`}
      className={`underline decoration-dotted ${className}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "copied" : (children ?? short(value))}
    </button>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-border">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.14em]">
          <ScrambleText text={title} speed={44} />
        </h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3 p-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="label-mono">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "h-10 border border-border bg-transparent px-3 font-mono text-[13px] outline-none transition-colors focus:border-border-strong " +
        (props.className ?? "")
      }
    />
  );
}

type Tone = "primary" | "ghost" | "danger";

/**
 * A button that runs an async action, surfacing pending / success (with an
 * explorer link) / error states inline. On success it calls `onDone`.
 */
export function TxButton({
  children,
  action,
  onDone,
  tone = "primary",
  disabled,
  confirm,
  title,
  valueMoving = false,
}: {
  children: ReactNode;
  action: () => Promise<TxActionResult>;
  onDone?: () => void;
  tone?: Tone;
  disabled?: boolean;
  confirm?: string;
  title?: string;
  /**
   * Marks an action that MOVES VALUE.
   *
   * Robinhood Chain has two-phase finality: the sequencer soft-confirms in
   * under a second, the batch is posted to Ethereum minutes later, and Ethereum
   * finality follows ~13 minutes after that. The docs advise relying on soft
   * confirmation for ordinary interactions and waiting for L1 posting on
   * high-value ones — so rather than silently presenting sub-second inclusion as
   * final, a value-moving action says which of the two it is showing.
   */
  valueMoving?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; sig?: string } | null>(
    null
  );

  const run = useCallback(async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const sig = hashOf(await action());
      setMsg({
        kind: "ok",
        text: valueMoving ? "Soft-confirmed by the sequencer" : "Confirmed",
        sig,
      });
      onDone?.();
    } catch (e) {
      setMsg({ kind: "err", text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  }, [action, onDone, confirm, valueMoving]);

  const toneCls =
    tone === "danger"
      ? "border border-danger/50 text-danger transition-colors hover:bg-danger hover:text-background"
      : tone === "ghost"
        ? "btn-ghost"
        : "btn-primary";

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        title={title}
        className={`inline-flex h-10 items-center justify-center px-4 text-sm disabled:opacity-50 ${toneCls}`}
      >
        {busy ? "Submitting…" : children}
      </button>
      {msg && (
        <span
          className={`font-mono text-[11px] ${msg.kind === "ok" ? "text-neon" : "text-danger"}`}
        >
          {msg.text}
          {msg.sig && (
            <>
              {" — "}
              <ExplorerLink value={msg.sig} kind="tx">
                {HAS_EXPLORER ? "view tx" : `tx ${short(msg.sig)}`}
              </ExplorerLink>
            </>
          )}
        </span>
      )}
    </div>
  );
}
