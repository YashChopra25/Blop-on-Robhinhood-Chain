#!/usr/bin/env node
/**
 * Dependency audit gate (H7).
 *
 * `npm audit --audit-level=high` is the obvious gate, but it is the wrong one
 * here: this tree carries a handful of high-severity advisories that have no
 * fixed version upstream AND cannot be reached by this application. A gate that
 * is permanently red gets ignored, which is worse than no gate — so instead,
 * each unreachable advisory is listed below with an explicit justification and
 * a review date, and ANYTHING ELSE at high or critical fails the build.
 *
 * Rules for editing ACCEPTED:
 *   * Only for advisories with no upstream fix that provably cannot execute in
 *     this app. "It's only a dev tool" is not enough — say why it never runs.
 *   * Always set `review`. An expired entry fails the build on purpose, so
 *     these are re-examined rather than accumulating forever.
 *
 * Usage: node scripts/audit-gate.mjs
 */

import { execFileSync } from "node:child_process";

/** @type {{id: string, package: string, why: string, review: string}[]} */
const ACCEPTED = [
  // Empty on purpose.
  //
  // The two `image-size` entries that lived here were justified by a path
  // through `@solana/wallet-adapter-react` -> react-native -> metro. That
  // dependency is gone with the EVM migration, and the packages were only
  // lingering as extraneous entries in `node_modules`; `npm prune` removed
  // them. Nothing is currently accepted, so any high/critical advisory fails.
];

const BLOCKING = new Set(["high", "critical"]);

function runAudit() {
  try {
    // npm audit exits non-zero when it finds anything, so capture rather than throw.
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(runAudit());
const accepted = new Map(ACCEPTED.map((a) => [a.id, a]));
const today = new Date().toISOString().slice(0, 10);

const unexpected = [];
const used = new Set();
const expired = [];

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!BLOCKING.has(vuln.severity)) continue;

  const advisories = (vuln.via ?? []).filter((v) => typeof v === "object");
  // A package whose `via` is only other package names inherits its severity
  // from them; it is covered when those are covered.
  if (advisories.length === 0) continue;

  for (const advisory of advisories) {
    const id = (advisory.url ?? "").split("/").pop();
    const entry = accepted.get(id);
    if (!entry) {
      unexpected.push({ name, id, title: advisory.title, severity: vuln.severity });
      continue;
    }
    used.add(id);
    if (entry.review < today) {
      expired.push({ ...entry, id });
    }
  }
}

let failed = false;

if (unexpected.length > 0) {
  failed = true;
  console.error("\nUnreviewed high/critical advisories:\n");
  for (const u of unexpected) {
    console.error(`  [${u.severity}] ${u.name} — ${u.id}`);
    console.error(`      ${u.title ?? "(no title)"}`);
  }
  console.error(
    "\nFix them, or — only if genuinely unreachable and unfixable upstream —\n" +
      "add an entry with a justification to ACCEPTED in scripts/audit-gate.mjs.\n"
  );
}

if (expired.length > 0) {
  failed = true;
  console.error("\nAccepted advisories are past their review date:\n");
  for (const e of expired) {
    console.error(`  ${e.package} — ${e.id} (review was due ${e.review})`);
  }
  console.error("\nRe-check whether a fix has shipped, then update or remove the entry.\n");
}

const stale = ACCEPTED.filter((a) => !used.has(a.id));
if (stale.length > 0) {
  // Not fatal: an exception that no longer matches usually means it was fixed.
  console.warn("\nAccepted advisories no longer present (safe to delete):");
  for (const s of stale) console.warn(`  ${s.package} — ${s.id}`);
}

if (failed) process.exit(1);

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `Audit gate passed. No unreviewed high/critical advisories. ` +
    `(moderate: ${counts.moderate ?? 0}, low: ${counts.low ?? 0}, ` +
    `accepted high: ${used.size})`
);
