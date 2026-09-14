"use client";

import { useMemo } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { wagmiConfig } from "@/lib/evm/client";
import { ReduxProvider } from "@/app/store/ReduxProvider";

/**
 * Provider stack.
 *
 * Replaces the Solana wallet-adapter tower
 * (`ConnectionProvider` → `WalletProvider` → `WalletModalProvider`) with
 * `WagmiProvider`, which carries both the RPC transport and the connectors.
 *
 * `QueryClientProvider` is no longer optional here: wagmi's hooks are built on
 * TanStack Query, so it is wagmi's cache as well as ours. It therefore has to
 * wrap `WagmiProvider`'s consumers, which is why the nesting order changed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are cheap but rate-limited on the public Robinhood
            // Chain endpoints; a short stale window collapses the duplicate
            // reads several dashboard panels would otherwise each fire.
            staleTime: 15_000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ReduxProvider>
          {children}
          <Toaster richColors theme="dark" position="bottom-right" />
        </ReduxProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
