"use client";

import { FC } from "react";

interface FlowDiagramNodesProps {
  activeNodes: string[];
  nodeClass: (nodeId: string) => string;
}

export const FlowDiagramNodes: FC<FlowDiagramNodesProps> = ({
  activeNodes,
  nodeClass,
}) => {
  return (
    <>
      {/* Glowing Radial Backgrounds */}
      <circle
        cx="60"
        cy="50"
        r="30"
        fill="url(#owner-grad)"
        className={activeNodes.includes("owner") ? "opacity-100" : "opacity-0"}
      />
      <circle
        cx="260"
        cy="50"
        r="30"
        fill="url(#ipfs-grad)"
        className={activeNodes.includes("ipfs") ? "opacity-100" : "opacity-0"}
      />
      <circle
        cx="160"
        cy="120"
        r="30"
        fill="url(#will-grad)"
        className={activeNodes.includes("will") ? "opacity-100" : "opacity-0"}
      />
      <circle
        cx="60"
        cy="190"
        r="30"
        fill="url(#custodians-grad)"
        className={activeNodes.includes("custodians") ? "opacity-100" : "opacity-0"}
      />
      <circle
        cx="260"
        cy="190"
        r="30"
        fill="url(#heirs-grad)"
        className={activeNodes.includes("heirs") ? "opacity-100" : "opacity-0"}
      />

      {/* Node Shapes & Icons */}
      {/* Owner */}
      <g className={nodeClass("owner")} style={{ color: "var(--neon)" }}>
        <circle cx="60" cy="50" r="18" fill="#0f0919" stroke="currentColor" strokeWidth="2" />
        <circle cx="60" cy="46" r="3.5" fill="currentColor" />
        <path
          d="M 53 56 C 53 52 56 51 60 51 C 64 51 67 52 67 56"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* IPFS */}
      <g className={nodeClass("ipfs")} style={{ color: "#6366f1" }}>
        <circle cx="260" cy="50" r="18" fill="#0f0919" stroke="currentColor" strokeWidth="2" />
        <path
          d="M 254 42 H 266 V 58 H 254 Z M 257 46 H 263 M 257 50 H 263 M 257 54 H 261"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* Will record, keyed by the owner address */}
      <g className={nodeClass("will")} style={{ color: "var(--accent)" }}>
        <circle cx="160" cy="120" r="18" fill="#0f0919" stroke="currentColor" strokeWidth="2" />
        <rect x="153" y="117" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M 156 117 V 113 A 4 4 0 0 1 164 113 V 117"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* Custodians */}
      <g className={nodeClass("custodians")} style={{ color: "#fbbf24" }}>
        <circle cx="60" cy="190" r="18" fill="#0f0919" stroke="currentColor" strokeWidth="2" />
        <path
          d="M 52 181 H 68 V 190 C 68 196 60 200 60 200 C 60 200 52 196 52 190 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Heirs */}
      <g className={nodeClass("heirs")} style={{ color: "#ec4899" }}>
        <circle cx="260" cy="190" r="18" fill="#0f0919" stroke="currentColor" strokeWidth="2" />
        <circle cx="254" cy="185" r="2.5" fill="currentColor" />
        <path
          d="M 250 193 C 250 190 252 189 255 189 C 258 189 260 190 260 193"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx="265" cy="186" r="2" fill="currentColor" />
        <path
          d="M 262 193 C 262 191 263 190 265 190 C 267 190 268 191 268 193"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
    </>
  );
};
