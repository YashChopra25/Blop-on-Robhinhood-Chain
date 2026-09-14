export type Status = "idle" | "active" | "at-risk" | "triggered" | "claimed";

export interface LogEntry {
  id: number;
  t: number;
  msg: string;
  kind: "info" | "ok" | "warn" | "err";
}

export interface State {
  connected: boolean;
  connecting: boolean;
  wallet: string;
  balance: number;
  beneficiary: string;
  amount: string;
  intervalDays: number;
  status: Status;
  lastPingMs: number;
  nowMs: number;
  pinging: boolean;
  claiming: boolean;
  log: LogEntry[];
  logSeq: number;
}

export type Action =
  | { type: "tick" }
  | { type: "connect-start" }
  | { type: "connect-done" }
  | { type: "set"; key: keyof State; value: State[keyof State] }
  | { type: "ping-start" }
  | { type: "ping-done" }
  | { type: "force-trigger" }
  | { type: "claim-start" }
  | { type: "claim-done" }
  | { type: "reset" }
  | { type: "log"; msg: string; kind?: "info" | "ok" | "warn" | "err" };
