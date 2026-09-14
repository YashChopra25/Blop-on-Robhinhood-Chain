"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useVault } from "@/hooks/useVault";
import { useWill } from "@/hooks/useWill";
import { useAppDispatch } from "@/app/store/hooks";
import { clearWills, setConnectedOwner } from "@/app/store/willSlice";
import { DashboardSidebar } from "@/app/components/dashboard/shared/DashboardSidebar";
import { DashboardHeader } from "@/app/components/dashboard/shared/DashboardHeader";
import { DisconnectedView } from "@/app/components/dashboard/shared/DisconnectedView";
import { VaultLoader } from "@/app/components/dashboard/shared/VaultLoader";
import { DeathConfirmationBanner } from "@/app/components/dashboard/shared/DeathConfirmationBanner";
import { X } from "lucide-react";

/** The mount state never changes after hydration, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Hydration guard: wallet state only exists on the client, so the first paint
  // must match the server. `useSyncExternalStore` reports false on the server
  // and true on the client without a setState-in-effect cascade.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const vault = useVault();
  const { connected } = vault;
  const dispatch = useAppDispatch();
  const walletKey = vault.address ?? null;

  // Tell the store whose will the dashboard is showing, and drop every cached
  // will on disconnect so the next wallet never sees the previous one's estate.
  useEffect(() => {
    dispatch(setConnectedOwner(walletKey));
    if (!walletKey) dispatch(clearWills());
  }, [dispatch, walletKey]);

  // Loads the will into `state.will.byOwner`; every page reads it from there
  // via `useDashboard()` rather than having it passed down.
  const { data, loading, refresh } = useWill(walletKey);

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-100">
        <div className="size-5 animate-spin rounded-full border border-border-strong border-t-accent" />
      </div>
    );
  }

  const renderContent = () => {
    if (!connected) {
      return (
        <div className="max-w-7xl mx-auto px-6 py-8 w-full">
          <DisconnectedView />
        </div>
      );
    }
    if (loading && !data) {
      return <VaultLoader />;
    }
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 w-full flex flex-col gap-6">
        {/* C3: shown on every dashboard page — an owner returning to a wrongly
            confirmed will may land anywhere, and the window to cancel is finite. */}
        <DeathConfirmationBanner will={data?.will ?? null} refresh={refresh} />
        {children}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 subtle-grid" />

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <DashboardSidebar />
      </div>

      {/* Mobile Sidebar (Drawer Overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-64 max-w-xs flex-col bg-surface">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 p-2 text-muted transition-colors hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <DashboardSidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 z-10">
        <DashboardHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">{renderContent()}</main>
      </div>
    </div>
  );
}
