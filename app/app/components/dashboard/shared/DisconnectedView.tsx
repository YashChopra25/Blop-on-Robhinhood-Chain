"use client";

import { FC } from "react";
import { LifecycleFlow } from "../overview/LifecycleFlow";
import { ContextFlowDiagram } from "../overview/ContextFlowDiagram";
import { DotField } from "@/app/components/fx/DotField";
import { ScrambleText } from "@/app/components/fx/ScrambleText";
import { paintVaultWheel } from "@/app/components/fx/artwork";
import { ConnectWalletButton } from "./ConnectWalletButton";

export const DisconnectedView: FC = () => {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="mx-auto w-full max-w-2xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="label-mono">Session</span>
          <span className="label-mono text-warn">locked</span>
        </div>

        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="w-32 text-muted">
            <DotField
              paint={paintVaultWheel}
              aspect={1}
              cell={4}
              fill={0.6}
              radius={80}
              force={28}
              className="block w-full cursor-crosshair"
              ariaLabel="Locked vault"
            />
          </div>

          <h3 className="mt-8 font-mono text-[13px] uppercase tracking-[0.14em]">
            <ScrambleText text="Wallet not connected" trigger="mount" speed={30} />
          </h3>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            <ScrambleText
              text="Connect an EVM browser wallet to start sealing a will, or to claim an inheritance you have been named in."
              speed={150}
            />
          </p>

          <div className="mt-6">
            <ConnectWalletButton />
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <LifecycleFlow />
        <ContextFlowDiagram />
      </div>

      <div className="mx-auto w-full max-w-2xl border border-border p-5">
        <p className="label-mono text-accent">Trustless architecture</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          <ScrambleText
            text="Fully non-custodial. Your files never touch a centralized server — they are pinned to IPFS, and the contract controls every state transition on Robinhood Chain. No third party can modify your will settings or preview your files."
            speed={190}
          />
        </p>
      </div>
    </div>
  );
};
