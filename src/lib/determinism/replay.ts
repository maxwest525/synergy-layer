import { createHash } from "node:crypto";

/**
 * The same rows produce the same findings, and that is provable (CODE-98).
 *
 * A rule that is deterministic in principle drifts in practice for reasons that
 * never look like a bug at the time: a Set iterated in insertion order, a sort
 * that leaves ties where it found them, a Date read at the moment of filing, a
 * float formatted differently on another platform. None of those fail a test
 * that checks one finding's contents. All of them mean today's run and
 * tomorrow's disagree.
 *
 * This canonicalises a finding set and hashes it. A replay test freezes an
 * evidence fixture, runs the detectors, and asserts the digest. When the digest
 * moves, either the rule changed on purpose, in which case the new digest is
 * committed alongside the reason, or something non-deterministic got in and the
 * failure is the point.
 *
 * What is deliberately excluded from the digest: anything that is not a
 * function of the evidence. Timestamps, row ids, confidence values derived from
 * a clock. A digest that changed every run would prove nothing and would be
 * quietly disabled within a week.
 */

/** The part of a finding that must be a pure function of the evidence. */
export type ReplayableFinding = {
  rule: string;
  target: string;
  /** The claim as it will be shown. Included because wording drift is drift. */
  description: string;
  /**
   * The measured values the finding rests on. Keys are sorted and values
   * serialised canonically, so key order in the source object cannot change the
   * digest.
   */
  evidence: Record<string, unknown>;
};

/**
 * Canonical JSON: object keys sorted at every depth, arrays left in order.
 *
 * Array order is preserved rather than sorted because order carries meaning in
 * these payloads: a rotation timeline is a sequence, and sorting it would erase
 * the thing being reported. A detector that returns arrays in an unstable order
 * is the defect this is meant to expose, not something to paper over here.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  // -0 and 0 serialise differently and are the same measurement.
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

/**
 * Findings in a stable order, independent of the order the detectors ran.
 *
 * Sorted by rule then target then description, all three, so two findings that
 * differ only in their evidence still land in a fixed position.
 */
export function orderFindings(findings: readonly ReplayableFinding[]): ReplayableFinding[] {
  return [...findings].sort(
    (a, b) =>
      a.rule.localeCompare(b.rule) ||
      a.target.localeCompare(b.target) ||
      a.description.localeCompare(b.description),
  );
}

export function canonicalFindingText(findings: readonly ReplayableFinding[]): string {
  return JSON.stringify(
    orderFindings(findings).map((finding) => canonicalize(finding)),
    null,
    2,
  );
}

/** The digest a replay test asserts. */
export function replayDigest(findings: readonly ReplayableFinding[]): string {
  return createHash("sha256").update(canonicalFindingText(findings), "utf8").digest("hex");
}

export type ReplayComparison =
  | { stable: true; digest: string; findings: number }
  | { stable: false; digest: string; expected: string; firstDifference: string };

/**
 * Compare a run against a recorded digest, and say where it first diverged.
 *
 * A bare hash mismatch tells an operator nothing, and a rule author staring at
 * two hex strings will disable the test. The line number and the two lines are
 * what makes the failure actionable.
 */
export function compareReplay(
  findings: readonly ReplayableFinding[],
  expected: string,
  previousText?: string,
): ReplayComparison {
  const text = canonicalFindingText(findings);
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  if (digest === expected) return { stable: true, digest, findings: findings.length };

  let firstDifference = "The recorded canonical text was not supplied, so only the digest differs.";
  if (previousText !== undefined) {
    const now = text.split("\n");
    const before = previousText.split("\n");
    const at = now.findIndex((line, index) => line !== before[index]);
    firstDifference =
      at === -1
        ? `Identical for ${Math.min(now.length, before.length)} lines, then one side ends: ${before.length} recorded against ${now.length} now.`
        : `Line ${at + 1}: recorded ${JSON.stringify(before[at] ?? "(end)")}, now ${JSON.stringify(now[at] ?? "(end)")}.`;
  }
  return { stable: false, digest, expected, firstDifference };
}
