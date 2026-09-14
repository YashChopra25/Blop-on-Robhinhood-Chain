import { FC } from "react";
import { LogEntry } from "@/app/types/demo.types";
import { ScrambleText } from "@/app/components/fx/ScrambleText";
import { SquigglyText } from "@/app/components/fx/SquigglyText";

interface DemoInfoProps {
  log: LogEntry[];
}

export const DemoInfo: FC<DemoInfoProps> = ({ log }) => {
  return (
    <div className="lg:sticky lg:top-20">
      <p className="label-mono text-accent">
        <ScrambleText text="Interactive demo" trigger="view" speed={40} />
      </p>
      <SquigglyText
        as="h2"
        rest={0.7}
        peak={6}
        className="mt-4 block text-3xl tracking-tight sm:text-[38px]"
      >
        <ScrambleText text="Walk through a full will lifecycle." trigger="view" speed={72} />
      </SquigglyText>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
        <ScrambleText
          text="Connect a simulated wallet, seal a will, and check in to stay active. Or skip the wait — trip the switch and watch the custodian quorum confirm, then your beneficiary unlock the sealed documents."
          speed={200}
        />
      </p>
      <p className="mt-3 label-mono">
        Demo time runs at 3,600× · no transactions are broadcast
      </p>

      <div className="mt-8 border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="label-mono">On-chain log</span>
          <span className="index-mono">{String(log.length).padStart(2, "0")}</span>
        </div>
        <ul className="max-h-72 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed">
          {log.length === 0 ? (
            <li className="text-faint caret">awaiting wallet connection</li>
          ) : (
            log.map((l) => (
              <li key={l.id} className="flex items-start gap-2 py-0.5 text-muted">
                <span
                  className={
                    l.kind === "ok"
                      ? "text-neon"
                      : l.kind === "warn"
                        ? "text-warn"
                        : l.kind === "err"
                          ? "text-danger"
                          : "text-accent"
                  }
                >
                  ›
                </span>
                <span>
                  <span className="text-faint">
                    {new Date(l.t).toLocaleTimeString([], { hour12: false })}
                  </span>{" "}
                  {l.msg}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};
