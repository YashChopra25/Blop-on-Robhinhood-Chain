"use client";

import { FC } from "react";
import { FlowDiagramNodes } from "./FlowDiagramNodes";
import { FlowDiagramLabels } from "./FlowDiagramLabels";
import { StateDetails } from "./diagram.constants";

interface ContextFlowDiagramSvgProps {
  state: StateDetails;
  nodeClass: (nodeId: string) => string;
  pathClass: (pathId: string) => string;
}

export const ContextFlowDiagramSvg: FC<ContextFlowDiagramSvgProps> = ({
  state,
  nodeClass,
  pathClass,
}) => {
  return (
    <div className="relative w-full h-[220px] flex items-center justify-center bg-black/15 rounded-xl border border-border overflow-hidden">
      <svg className="w-full h-full" viewBox="0 0 320 240">
        <defs>
          {/* Gradients for glowing node highlights */}
          <radialGradient id="owner-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--neon)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--neon)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ipfs-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="will-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="custodians-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="heirs-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Connection Lines (Network Edges) */}
        {/* Owner -> Will */}
        <path
          id="owner_will_path"
          d="M 60 50 L 160 120"
          fill="none"
          className={`${pathClass("owner_will")} ${
            state.activePaths.includes("owner_will") ? "active-flow-path" : ""
          }`}
        />
        {/* Owner -> IPFS */}
        <path
          id="owner_ipfs_path"
          d="M 60 50 L 260 50"
          fill="none"
          className={`${pathClass("owner_ipfs")} ${
            state.activePaths.includes("owner_ipfs") ? "active-flow-path" : ""
          }`}
        />
        {/* Custodians -> Will */}
        <path
          id="custodian_will_path"
          d="M 60 190 L 160 120"
          fill="none"
          className={`${pathClass("custodian_will")} ${
            state.activePaths.includes("custodian_will") ? "active-flow-path" : ""
          }`}
        />
        {/* Will -> Heirs */}
        <path
          id="will_heir_path"
          d="M 160 120 L 260 190"
          fill="none"
          className={`${pathClass("will_heir")} ${
            state.activePaths.includes("will_heir") ? "active-flow-path" : ""
          }`}
        />
        {/* IPFS -> Heirs */}
        <path
          id="ipfs_heir_path"
          d="M 260 50 L 260 190"
          fill="none"
          className={`${pathClass("ipfs_heir")} ${
            state.activePaths.includes("ipfs_heir") ? "active-flow-path" : ""
          }`}
        />

        {/* Animated Particles flowing along paths */}
        {state.activePaths.map((pathId) => (
          <circle key={pathId} r="3.5" fill={state.particleColor} className="filter drop-shadow-[0_0_4px_currentColor]">
            <animateMotion
              dur="2.4s"
              repeatCount="indefinite"
              path={
                pathId === "owner_will"
                  ? "M 60 50 L 160 120"
                  : pathId === "owner_ipfs"
                  ? "M 60 50 L 260 50"
                  : pathId === "custodian_will"
                  ? "M 60 190 L 160 120"
                  : pathId === "will_heir"
                  ? "M 160 120 L 260 190"
                  : "M 260 50 L 260 190"
              }
            />
          </circle>
        ))}

        <FlowDiagramNodes activeNodes={state.activeNodes} nodeClass={nodeClass} />
        <FlowDiagramLabels />
      </svg>
    </div>
  );
};
