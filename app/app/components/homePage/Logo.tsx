import { ScrambleText } from "@/app/components/fx/ScrambleText";

/**
 * A hairline badge holding the vault wheel, next to a mono wordmark that
 * shreds and rebuilds when the pointer crosses it.
 */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <div className="group flex items-center gap-2.5">
      <span
        className="grid shrink-0 place-items-center border border-border-strong"
        style={{ width: size, height: size }}
      >
        <svg
          width={size * 0.62}
          height={size * 0.62}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="12" cy="12" r="7.5" stroke="var(--accent)" strokeWidth="1.6" />
          <path
            d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3"
            stroke="var(--accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="1.9" fill="var(--accent)" />
        </svg>
      </span>
      <ScrambleText
        text="BLOP"
        trigger="zone"
        speed={38}
        className="font-mono text-[13px] font-semibold tracking-[0.16em] text-foreground"
        noiseClassName="text-accent"
      />
    </div>
  );
}
