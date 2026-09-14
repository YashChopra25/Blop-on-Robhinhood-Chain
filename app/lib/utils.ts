import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { explorerUrl, HAS_EXPLORER } from "./evm/config"
import { WILL_STATUS_LABEL, WillStatus } from "./evm/types"

export { humanizeError } from "./evm/tx"
export { HAS_EXPLORER } from "./evm/config"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/** Blockscout transaction link for the configured chain. */
export function explorerTxUrl(hash: string): string {
  return explorerUrl(hash, "tx");
}

export function explorerAddressUrl(address: string): string {
  return explorerUrl(address, "address");
}

/**
 * `WillStatus` → the lowercase label the UI switches on.
 *
 * On Solana this had to unwrap Anchor's `{ active: {} }` enum encoding with
 * `Object.keys(...)[0]`. A Solidity enum decodes to a number, so this is a
 * lookup rather than a shape inspection — and an unknown value is now
 * impossible rather than merely unlikely.
 */
export function willStatusLabel(status: WillStatus): string {
  return WILL_STATUS_LABEL[status] ?? "unknown";
}

/**
 * Shorten an address or hash for display.
 *
 * Six leading characters rather than the Solana version's four: an EVM address
 * always starts with `0x`, so `0x1234…` carries the same two characters of real
 * entropy that `4vJ9…` did.
 */
export function short(value: string | undefined | null): string {
  if (!value) return "";
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

/** `93_784_000` ms → `"01d 02h 03m 04s"`. Padded for a monospace timer. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "00d 00h 00m 00s";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

/**
 * `93_784_000` ms → `"1 day"`. The coarsest unit that still says something
 * useful, for prose where a ticking timer would be noise.
 */
export function formatRelativeDuration(ms: number): string {
  if (ms <= 0) return "0 minutes";
  const totalSec = Math.floor(ms / 1000);
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (totalSec >= 86400) return plural(Math.floor(totalSec / 86400), "day");
  if (totalSec >= 3600) return plural(Math.floor(totalSec / 3600), "hour");
  if (totalSec >= 60) return plural(Math.floor(totalSec / 60), "minute");
  return plural(totalSec, "second");
}
