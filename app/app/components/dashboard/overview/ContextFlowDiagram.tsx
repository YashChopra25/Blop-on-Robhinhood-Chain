"use client";

import { useEffect, useState, FC } from "react";
import { ContextFlowDiagramSvg } from "./ContextFlowDiagramSvg";
import { STATES } from "./diagram.constants";

export const ContextFlowDiagram: FC = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % STATES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const state = STATES[activeIdx];

  const nodeClass = (nodeId: string) => {
    const active = state.activeNodes.includes(nodeId);
    return `transition-all duration-500 ${
      active
        ? `opacity-100 scale-105 filter drop-shadow-[0_0_8px_currentColor]`
        : "opacity-40 scale-95"
    }`;
  };

  const pathClass = (pathId: string) => {
    const active = state.activePaths.includes(pathId);
    return `transition-all duration-500 ${
      active
        ? "stroke-white/60 stroke-[2.5px]"
        : "stroke-white/10 stroke-[1.5px]"
    }`;
  };

  return (
    <div className="rounded-2xl border border-border bg-white/1 p-5 glass relative overflow-hidden flex flex-col gap-4">
      {/* CSS Styles injection for smooth dot movement */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes dashFlow {
          to {
            stroke-dashoffset: -20;
          }
        }
        .active-flow-path {
          stroke-dasharray: 4 4;
          animation: dashFlow 1.2s linear infinite;
        }
      `,
        }}
      />

      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
            Decentralized Data Flow
          </h3>
          <p className="text-[10px] text-muted mt-0.5">
            Interaction Context Model
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-2 py-1 rounded text-[10px] font-mono border transition-all cursor-pointer ${
            isPlaying
              ? "bg-[var(--accent)]/15 text-accent border-[var(--accent)]/20"
              : "bg-white/5 text-muted border-border"
          }`}
        >
          {isPlaying ? "● Auto-play" : "○ Paused"}
        </button>
      </div>

      <ContextFlowDiagramSvg state={state} nodeClass={nodeClass} pathClass={pathClass} />

      {/* State Switcher & Description */}
      <div className="flex flex-col gap-2 bg-white/2 border border-border p-3 rounded-xl min-h-[90px] justify-center transition-all duration-300">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground transition-all duration-300">
            {state.title}
          </span>
          <div className="flex gap-1.5">
            {STATES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setActiveIdx(idx);
                  setIsPlaying(false); // Pause on user interaction
                }}
                className={`size-2 rounded-full transition-all cursor-pointer ${
                  idx === activeIdx
                    ? "bg-accent scale-110 shadow-[0_0_6px_var(--accent)]"
                    : "bg-white/20 hover:bg-white/40"
                }`}
                title={`Switch to state ${idx + 1}`}
              />
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted leading-relaxed transition-all duration-300">
          {state.description}
        </p>
      </div>
    </div>
  );
};

export default ContextFlowDiagram;
