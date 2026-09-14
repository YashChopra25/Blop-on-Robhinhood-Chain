import {
  Clock,
  Hourglass,
  Lock,
  Unlock,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ClaimPhase } from "@/app/types/inheritance.types";

interface PhaseMeta {
  label: string;
  icon: LucideIcon;
  /** Status pill styling. */
  pillCls: string;
  /** Lock glyph styling on the card. */
  iconCls: string;
}

/**
 * How each point on the post-death timeline reads to an heir.
 *
 * Keyed by `ClaimPhase`, not by the will's on-chain status: "claimable" covers
 * three very different situations for an heir — frozen during the owner's
 * revocation window, actually claimable, and past the deadline — and only the
 * middle one is worth showing in green.
 */
export const PHASE_META: Record<ClaimPhase, PhaseMeta> = {
  active: {
    label: "Owner active",
    icon: Lock,
    pillCls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    iconCls: "text-muted",
  },
  pending: {
    label: "Confirming",
    icon: Clock,
    pillCls: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    iconCls: "text-amber-400",
  },
  grace: {
    label: "Grace period",
    icon: Hourglass,
    pillCls: "bg-sky-500/10 border-sky-500/30 text-sky-400",
    iconCls: "text-sky-400",
  },
  open: {
    label: "Claimable now",
    icon: Unlock,
    pillCls: "bg-[var(--neon)]/10 border-[var(--neon)]/30 text-[var(--neon)]",
    iconCls: "text-[var(--neon)]",
  },
  closed: {
    label: "Window closed",
    icon: XCircle,
    pillCls: "bg-red-500/10 border-red-500/30 text-red-400",
    iconCls: "text-red-400",
  },
};

export const INHERITANCE_ROOT = "/dashboard/inheritance";
