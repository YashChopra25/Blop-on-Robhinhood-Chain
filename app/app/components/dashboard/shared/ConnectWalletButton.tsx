"use client";

import { useCallback, useState, useSyncExternalStore, type FC } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN, CHAIN_ID } from "@/lib/evm/config";
import { humanizeError, short } from "@/lib/utils";

/**
 * Wallet connection, chain detection and disconnection.
 *
 * Replaces the Solana app's `WalletMultiButton` from
 * `@solana/wallet-adapter-react-ui`, which handled connect / disconnect / wallet
 * choice in one drop-in component. There is no equivalent single import in the
 * wagmi ecosystem without pulling in a connect-modal library (RainbowKit, Web3
 * Modal), so the four states are handled explicitly here — which the EVM model
 * requires anyway, because a wallet can be connected to the WRONG CHAIN. That
 * state simply does not exist on Solana, where the dapp picks the cluster and the
 * wallet has no say, so it had no analogue in the original UI.
 *
 * The states, in the order they are checked:
 *
 *   1. not mounted      — render the disconnected label, to match the server
 *   2. disconnected     — offer the discovered wallets
 *   3. wrong / unsupported chain — offer to switch, and block everything else
 *   4. connected        — show the address, click to disconnect
 *
 * Account changes and chain changes need no handling here: wagmi subscribes to
 * the EIP-1193 `accountsChanged` / `chainChanged` events and re-renders every
 * consumer of `useAccount` / `useChainId`, so both are already reactive
 * everywhere (the dashboard layout clears the cached will off `vault.address`,
 * and `useVault` recomputes `wrongNetwork` off the live chain id).
 */

/** The mount state never changes after hydration, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};

export const ConnectWalletButton: FC = () => {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wallet state exists only on the client, so the first paint has to match the
  // server's or React discards the tree with a hydration mismatch.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  const attemptConnect = useCallback(
    (connectorId: string) => {
      const connector = connectors.find((c) => c.uid === connectorId);
      if (!connector) return;
      setError(null);
      setPickerOpen(false);
      connect(
        { connector, chainId: CHAIN_ID },
        { onError: (e) => setError(humanizeError(e)) }
      );
    },
    [connect, connectors]
  );

  const attemptSwitch = useCallback(() => {
    setError(null);
    switchChain(
      { chainId: CHAIN_ID },
      { onError: (e) => setError(humanizeError(e)) }
    );
  }, [switchChain]);

  const label = "inline-flex h-9 items-center gap-2 border px-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors";

  if (!mounted || !isConnected || !address) {
    // A browser with no wallet extension and no WalletConnect project id
    // announces no connectors at all, which deserves a different message from
    // "click to connect".
    const available = connectors;

    return (
      <div className="relative flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={!mounted || connecting || available.length === 0}
          onClick={() => {
            setError(null);
            if (available.length === 1) attemptConnect(available[0].uid);
            else setPickerOpen((o) => !o);
          }}
          className={`${label} border-border-strong text-foreground hover:bg-foreground hover:text-background disabled:opacity-50`}
        >
          {connecting
            ? "Connecting…"
            : available.length === 0 && mounted
              ? "No wallet found"
              : "Connect wallet"}
        </button>

        {pickerOpen && available.length > 1 && (
          <div className="absolute right-0 top-10 z-40 flex min-w-44 flex-col border border-border bg-surface">
            {available.map((c) => (
              <button
                key={c.uid}
                type="button"
                onClick={() => attemptConnect(c.uid)}
                className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:bg-border/40 hover:text-foreground"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <span className="max-w-56 text-right font-mono text-[10px] text-danger">
            {error}
          </span>
        )}
      </div>
    );
  }

  // Connected, but the wallet is pointed somewhere else. Every read would return
  // empty and every write would land on the wrong network, so this takes over the
  // button entirely rather than sitting beside the address.
  if (chainId !== CHAIN_ID) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={attemptSwitch}
          disabled={switching}
          className={`${label} border-warn/60 text-warn hover:bg-warn hover:text-background disabled:opacity-50`}
          title={`Connected to chain ${chainId ?? "unknown"}; this app targets ${CHAIN.name} (${CHAIN_ID}).`}
        >
          {switching ? "Switching…" : `Switch to ${CHAIN.name}`}
        </button>
        {error && (
          <span className="max-w-56 text-right font-mono text-[10px] text-danger">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title={`${address} — click to disconnect`}
      className={`${label} border-border text-muted hover:border-danger/50 hover:text-danger`}
    >
      <span className="size-1.5 rounded-full bg-neon" />
      {short(address)}
    </button>
  );
};
