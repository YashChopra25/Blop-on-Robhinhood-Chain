import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { State, Action } from "@/app/types/demo.types";

const DEMO_WALLET = "7H4qB2EYAaXk2Lm7tQfGzPvR8sN3w6yCJxKpYdVwQ2P";
const DEMO_BENEFICIARY = "9xVuPq3Tn8eK4mJ2hL5rDc7sFvZbWnAyXqkpTjUkP1";
const TIME_COMPRESSION = 60 * 60;

export function shorten(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "00d 00h 00m 00s";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

const INITIAL: State = {
  connected: false,
  connecting: false,
  wallet: "",
  balance: 14.382,
  beneficiary: DEMO_BENEFICIARY,
  amount: "40",
  intervalDays: 30,
  status: "idle",
  lastPingMs: 0,
  nowMs: 0,
  pinging: false,
  claiming: false,
  log: [],
  logSeq: 0,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "tick":
      return { ...state, nowMs: Date.now() };
    case "connect-start":
      return { ...state, connecting: true };
    case "connect-done":
      return {
        ...state,
        connecting: false,
        connected: true,
        wallet: DEMO_WALLET,
      };
    case "set":
      return { ...state, [action.key]: action.value } as State;
    case "ping-start":
      return { ...state, pinging: true };
    case "ping-done":
      return {
        ...state,
        pinging: false,
        lastPingMs: Date.now(),
        status: "active",
      };
    case "force-trigger":
      return { ...state, status: "triggered" };
    case "claim-start":
      return { ...state, claiming: true };
    case "claim-done":
      return { ...state, claiming: false, status: "claimed" };
    case "reset":
      return {
        ...INITIAL,
        connected: state.connected,
        wallet: state.wallet,
        nowMs: Date.now(),
      };
    case "log": {
      const next = state.logSeq + 1;
      return {
        ...state,
        logSeq: next,
        log: [
          {
            id: next,
            t: Date.now(),
            msg: action.msg,
            kind: action.kind ?? "info",
          },
          ...state.log,
        ].slice(0, 6),
      };
    }
  }
}

export function useDemoState() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    dispatch({ type: "tick" });
    tickRef.current = window.setInterval(
      () => dispatch({ type: "tick" }),
      1000
    );
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const totalWindowMs = state.intervalDays * 24 * 60 * 60 * 1000;
  const elapsedRealMs = state.lastPingMs ? state.nowMs - state.lastPingMs : 0;
  const elapsedVaultMs = elapsedRealMs * TIME_COMPRESSION;
  const remainingMs = Math.max(totalWindowMs - elapsedVaultMs, 0);
  const progress =
    state.lastPingMs && totalWindowMs > 0
      ? Math.min(elapsedVaultMs / totalWindowMs, 1)
      : 0;

  useEffect(() => {
    if (!state.lastPingMs) return;
    if (state.status === "triggered" || state.status === "claimed") return;
    if (remainingMs <= 0) {
      dispatch({ type: "set", key: "status", value: "triggered" });
      dispatch({
        type: "log",
        msg: "Inactivity window elapsed — custodian quorum confirmed. Will is claimable.",
        kind: "warn",
      });
    } else if (progress > 0.8 && state.status !== "at-risk") {
      dispatch({ type: "set", key: "status", value: "at-risk" });
      dispatch({
        type: "log",
        msg: "At-risk: < 20% of window remaining. Check in soon.",
        kind: "warn",
      });
    }
  }, [progress, remainingMs, state.lastPingMs, state.status]);

  const connect = useCallback(async () => {
    if (state.connected || state.connecting) return;
    dispatch({ type: "connect-start" });
    dispatch({ type: "log", msg: "Requesting Phantom approval…" });
    await new Promise((r) => setTimeout(r, 850));
    dispatch({ type: "connect-done" });
    dispatch({
      type: "log",
      msg: `Connected ${shorten(DEMO_WALLET)} · will loaded`,
      kind: "ok",
    });
  }, [state.connected, state.connecting]);

  const ping = useCallback(async () => {
    if (!state.connected || state.pinging) return;
    if (state.status === "triggered" || state.status === "claimed") return;
    dispatch({ type: "ping-start" });
    dispatch({ type: "log", msg: "Signing check-in transaction…" });
    await new Promise((r) => setTimeout(r, 700));
    dispatch({ type: "ping-done" });
    dispatch({
      type: "log",
      msg: "Check-in confirmed · inactivity timer reset",
      kind: "ok",
    });
  }, [state.connected, state.pinging, state.status]);

  const simulateDeath = useCallback(() => {
    if (state.status === "triggered" || state.status === "claimed") return;
    dispatch({ type: "force-trigger" });
    dispatch({
      type: "log",
      msg: "Custodian quorum confirmed passing — will is now claimable.",
      kind: "warn",
    });
  }, [state.status]);

  const claim = useCallback(async () => {
    if (state.status !== "triggered" || state.claiming) return;
    dispatch({ type: "claim-start" });
    dispatch({
      type: "log",
      msg: `Beneficiary ${shorten(state.beneficiary)} claiming…`,
    });
    await new Promise((r) => setTimeout(r, 900));
    dispatch({ type: "claim-done" });
    dispatch({
      type: "log",
      msg: `Beneficiary unlocked 8 encrypted files from IPFS.`,
      kind: "ok",
    });
  }, [state.beneficiary, state.claiming, state.status]);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
    dispatch({ type: "log", msg: "Will reset for new simulation.", kind: "info" });
  }, []);

  const setBeneficiary = useCallback((value: string) => {
    dispatch({ type: "set", key: "beneficiary", value });
  }, []);

  const setAmount = useCallback((value: string) => {
    dispatch({ type: "set", key: "amount", value });
  }, []);

  const setIntervalDays = useCallback((value: number) => {
    dispatch({ type: "set", key: "intervalDays", value });
  }, []);

  const statusMeta = useMemo(() => {
    switch (state.status) {
      case "active":
        return {
          label: "Active",
          dot: "bg-neon",
          text: "text-neon",
          bg: "bg-[rgba(95,191,143,0.07)]",
          border: "border-[rgba(95,191,143,0.35)]",
        };
      case "at-risk":
        return {
          label: "At risk",
          dot: "bg-warn",
          text: "text-warn",
          bg: "bg-[rgba(217,154,58,0.07)]",
          border: "border-[rgba(217,154,58,0.35)]",
        };
      case "triggered":
        return {
          label: "Claimable",
          dot: "bg-danger",
          text: "text-danger",
          bg: "bg-[rgba(209,91,78,0.07)]",
          border: "border-[rgba(209,91,78,0.4)]",
        };
      case "claimed":
        return {
          label: "Claimed",
          dot: "bg-accent",
          text: "text-accent",
          bg: "bg-[rgba(217,154,58,0.07)]",
          border: "border-[rgba(217,154,58,0.4)]",
        };
      default:
        return {
          label: "Idle",
          dot: "bg-faint",
          text: "text-muted",
          bg: "bg-transparent",
          border: "border-border-strong",
        };
    }
  }, [state.status]);

  return {
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
  };
}
