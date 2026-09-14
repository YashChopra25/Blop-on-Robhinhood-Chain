"use client";

import { FC } from "react";

export const FlowDiagramLabels: FC = () => {
  return (
    <>
      <text
        x="60"
        y="80"
        textAnchor="middle"
        className="text-[9px] fill-white/60 font-medium font-sans"
      >
        Owner
      </text>
      <text
        x="260"
        y="80"
        textAnchor="middle"
        className="text-[9px] fill-white/60 font-medium font-sans"
      >
        IPFS Storage
      </text>
      <text
        x="160"
        y="150"
        textAnchor="middle"
        className="text-[9px] fill-accent font-semibold font-sans"
      >
        Will record
      </text>
      <text
        x="60"
        y="220"
        textAnchor="middle"
        className="text-[9px] fill-white/60 font-medium font-sans"
      >
        Custodians
      </text>
      <text
        x="260"
        y="220"
        textAnchor="middle"
        className="text-[9px] fill-white/60 font-medium font-sans"
      >
        Beneficiaries
      </text>
    </>
  );
};
