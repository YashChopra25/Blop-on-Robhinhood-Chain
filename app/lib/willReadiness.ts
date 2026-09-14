import type { WillBundle } from "@/lib/evm/types";

/**
 * Whether a will is ready to accept assets — documents (`addMedia`) and escrowed
 * tokens (`depositToken`).
 *
 * Both functions call `WillLib.requireQuorumReachable`, which reverts with
 * `QuorumUnreachable` unless `custodianCount > 0` AND
 * `minApprovals <= custodianCount`. The contract enforces this because a will
 * whose quorum can never be met would lock the estate away from the very heirs
 * it names.
 *
 * The UI mirrors that rule BEFORE the user spends time encrypting and uploading
 * a file, rather than letting them discover it in a reverted transaction at the
 * last step.
 *
 * One thing improved in the migration: the blocking rule is no longer re-derived
 * here at all. `getWill` returns `quorumReachable` computed by the contract
 * itself, so the checklist reports the chain's own opinion and the two can never
 * drift. The counts below are used only to write a helpful message.
 */

export type RequirementId =
  | "will"
  | "custodians"
  | "quorum"
  | "beneficiaries"
  | "heirKeys";

export interface Requirement {
  id: RequirementId;
  title: string;
  /** What is wrong and what to do about it, shown when `done` is false. */
  detail: string;
  done: boolean;
  /**
   * True when the contract itself reverts until this is satisfied.
   * Non-blocking requirements are strong recommendations: the chain accepts the
   * upload, but the result is not what the owner intends.
   */
  blocking: boolean;
  /** Where the user goes to satisfy it. */
  href: string;
  cta: string;
}

export interface WillReadiness {
  requirements: Requirement[];
  /** Requirements the contract enforces that are not yet met. */
  blockers: Requirement[];
  /** Met on-chain rule: assets may be added. */
  canAddAssets: boolean;
  /** Unmet advisory requirements — worth a warning, not a block. */
  warnings: Requirement[];
  custodianCount: number;
  minApprovals: number;
  /** How many more custodians are needed to make the quorum reachable. */
  shortfall: number;
}

export function evaluateWillReadiness(bundle: WillBundle | null): WillReadiness {
  const will = bundle?.will ?? null;

  const custodianCount = will?.custodianCount ?? bundle?.custodians.length ?? 0;
  const minApprovals = will?.minApprovals ?? 0;
  const beneficiaryCount = will?.beneficiaryCount ?? bundle?.beneficiaries.length ?? 0;
  const heirsWithoutKeys = (bundle?.beneficiaries ?? []).filter(
    (b) => !b.hasEncryptionKey
  ).length;

  const shortfall = Math.max(0, minApprovals - custodianCount);

  const requirements: Requirement[] = [
    {
      id: "will",
      title: "Create your will",
      detail: "Nothing can be sealed until the will exists on-chain.",
      done: !!will,
      blocking: true,
      href: "/dashboard/settings",
      cta: "Create will",
    },
    {
      id: "custodians",
      title: "Name at least one custodian",
      detail:
        "Custodians are the only parties who can confirm your passing. With none named, your estate could never be unlocked — so the contract refuses to hold assets for it.",
      done: custodianCount > 0,
      blocking: true,
      href: "/dashboard/custodians",
      cta: "Add custodian",
    },
    {
      id: "quorum",
      title: "Make the approval quorum reachable",
      detail:
        shortfall > 0
          ? `Your will requires ${minApprovals} approval${
              minApprovals === 1 ? "" : "s"
            } but only ${custodianCount} custodian${
              custodianCount === 1 ? " is" : "s are"
            } named. Add ${shortfall} more custodian${
              shortfall === 1 ? "" : "s"
            }, or lower the required approvals in Will Settings.`
          : `${minApprovals} of ${custodianCount} custodians must confirm before the will can be claimed.`,
      // The CONTRACT's own verdict, not a re-implementation of its rule.
      done: will?.quorumReachable ?? false,
      blocking: true,
      href: "/dashboard/settings",
      cta: "Adjust quorum",
    },
    {
      id: "beneficiaries",
      title: "Name your beneficiaries",
      detail:
        "Documents are sealed to each recipient at upload time. Heirs added after an upload can never open it, so name them first.",
      done: beneficiaryCount > 0,
      blocking: false,
      href: "/dashboard/beneficiaries",
      cta: "Add beneficiary",
    },
    {
      id: "heirKeys",
      title: "Have your heirs register a document key",
      detail:
        heirsWithoutKeys > 0
          ? `${heirsWithoutKeys} named ${
              heirsWithoutKeys === 1 ? "heir has" : "heirs have"
            } not published an encryption key yet. Anything uploaded now cannot be sealed to them, and cannot be shared with them retroactively.`
          : "Every named heir can be sealed to.",
      done: heirsWithoutKeys === 0,
      blocking: false,
      href: "/dashboard/beneficiaries",
      cta: "Review heirs",
    },
  ];

  const blockers = requirements.filter((r) => r.blocking && !r.done);
  const warnings = requirements.filter((r) => !r.blocking && !r.done);

  return {
    requirements,
    blockers,
    warnings,
    canAddAssets: blockers.length === 0,
    custodianCount,
    minApprovals,
    shortfall,
  };
}
