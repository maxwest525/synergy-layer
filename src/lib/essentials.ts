import type { Tone } from "@/components/os/primitives";

/**
 * Marketing Essentials status vocabulary. Deliberately small so an operator
 * reads the same six words everywhere. None of these words is derived from a
 * credential existing: configuration is not connection.
 */
export type EssentialStatus = "live" | "partial" | "ready" | "local" | "not_wired" | "reference";

export const STATUS_LABELS: Record<EssentialStatus, string> = {
  live: "Live data",
  partial: "Partial data",
  ready: "Ready to connect",
  local: "Available locally",
  not_wired: "Not wired",
  reference: "Reference only",
};

export const STATUS_TONE: Record<EssentialStatus, Tone> = {
  live: "success",
  partial: "warning",
  ready: "primary",
  local: "warning",
  not_wired: "neutral",
  reference: "neutral",
};

export type SystemFacts = {
  key: string;
  name: string;
  installed_state: string;
  credential_state: string;
  verification_state: string;
  aoos_connection_state: string;
  implemented_state: string;
};

/**
 * Status for a catalogued system, based only on what AOOS can prove. A system
 * that holds configuration metadata but is not implemented or connected is
 * "Ready to connect", never "Live data". A system installed on the operator
 * machine but not reachable from AOOS is "Available locally".
 */
export function systemStatus(system: SystemFacts | null): EssentialStatus {
  if (!system) return "not_wired";
  const connected = system.aoos_connection_state === "callable";
  if (connected && system.implemented_state === "implemented") return "live";
  if (connected && system.implemented_state === "partially_implemented") return "partial";
  if (system.installed_state === "installed") return "local";
  if (
    system.credential_state === "configured" ||
    system.credential_state === "encrypted_not_enumerated"
  ) {
    return "ready";
  }
  return "not_wired";
}

/** One-sentence gap for a catalogued system, matched to its status. */
export function systemGap(system: SystemFacts | null, missingName: string): string {
  const status = systemStatus(system);
  const name = system?.name ?? missingName;
  switch (status) {
    case "live":
      return `${name} is wired into AOOS and its reads are stored here.`;
    case "partial":
      return `${name} is wired into AOOS but only part of its surface is implemented.`;
    case "local":
      return `${name} is installed on the operator machine and is not connected to AOOS, so nothing it produces is stored here.`;
    case "ready":
      return `${name} has configuration metadata catalogued, but it is not implemented or connected in AOOS, so there is no data yet.`;
    default:
      return `${name} is not wired into AOOS, so there is nothing measured here yet.`;
  }
}

/** Evidence-backed status: rows we actually stored decide the wording. */
export function evidenceStatus(rowCount: number, complete: boolean): EssentialStatus {
  if (rowCount <= 0) return "not_wired";
  return complete ? "live" : "partial";
}

/**
 * Indexing coverage. Sitemap observations alone cannot answer "is this page
 * indexed", so sitemap-only evidence is partial, never live.
 */
export function indexingStatus(sitemapCount: number, urlInspectionWired: boolean): EssentialStatus {
  if (sitemapCount <= 0) return urlInspectionWired ? "partial" : "not_wired";
  return urlInspectionWired ? "live" : "partial";
}

export type BacklinkSample = {
  snapshotCount: number;
  referringDomains: number;
  backlinks: number;
};

/**
 * Authority is not scored. The evidence pass stores counts, anchors, spam
 * flags and history; no rule turns them into a score, and the card says so
 * rather than implying a verdict that was never made (LINK-1). The old
 * "stored sufficiency" it read was a scaffold whose every factor was
 * hard-wired to null, so it answered "insufficient" forever.
 */
export function backlinkAuthority(sample: BacklinkSample): {
  status: EssentialStatus;
  note: string;
} {
  if (sample.snapshotCount <= 0) {
    return {
      status: "not_wired",
      note: "No backlink snapshot has been collected yet.",
    };
  }
  return {
    status: "partial",
    note: `The stored sample is ${sample.referringDomains} referring domain(s) and ${sample.backlinks} link(s). Nothing in AOOS scores backlink authority: the evidence pass stores counts, anchors, spam flags and history, and no rule turns them into a score.`,
  };
}

/** Aggregate sitemap facts from the stored Search Console sitemap payload. */
export type SitemapSummary = {
  count: number;
  submitted: number | null;
  indexed: number | null;
  warnings: number | null;
  errors: number | null;
};

function sum(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

export function summarizeSitemaps(payload: unknown): SitemapSummary {
  const container = (payload ?? {}) as { sitemap?: unknown };
  const entries = Array.isArray(container.sitemap)
    ? (container.sitemap as Record<string, unknown>[])
    : [];
  const submitted: (number | null)[] = [];
  const indexed: (number | null)[] = [];
  for (const entry of entries) {
    const contents = Array.isArray(entry["contents"])
      ? (entry["contents"] as Record<string, unknown>[])
      : [];
    submitted.push(sum(contents.map((block) => numeric(block["submitted"]))));
    indexed.push(sum(contents.map((block) => numeric(block["indexed"]))));
  }
  return {
    count: entries.length,
    submitted: sum(submitted),
    indexed: sum(indexed),
    warnings: sum(entries.map((entry) => numeric(entry["warnings"]))),
    errors: sum(entries.map((entry) => numeric(entry["errors"]))),
  };
}

/** Thrown when a stored source could not be read; never silently zeroed. */
export class EssentialsReadError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(`${source} could not be read: ${message}`);
    this.name = "EssentialsReadError";
  }
}

/**
 * Guards a Supabase result. A failed read must surface as an error, never as a
 * zero count that would mislabel a capability as Not wired.
 */
export function assertRead<T extends { error: { message: string } | null }>(
  source: string,
  result: T,
): T {
  if (result.error) throw new EssentialsReadError(source, result.error.message);
  return result;
}

/** Recommended page changes: only concrete asset changes count. */
export function changeStatus(proposedCount: number, totalCount: number): EssentialStatus {
  if (totalCount <= 0) return "not_wired";
  return proposedCount > 0 ? "live" : "partial";
}

/**
 * What AOOS can prove about PageSpeed. A stored run is an attempt, not a
 * measurement: only a stored snapshot is a result.
 */
export type PageSpeedFacts = {
  /** AOOS ships an implemented manual bridge to the official v5 endpoint. */
  implemented: boolean;
  attempts: number;
  failures: number;
  successfulSnapshots: number;
  latestError: string | null;
  latestAttemptAt: string | null;
};

export function pageSpeedStatus(facts: PageSpeedFacts): EssentialStatus {
  if (!facts.implemented) return "not_wired";
  if (facts.successfulSnapshots > 0) return facts.failures > 0 ? "partial" : "live";
  if (facts.attempts > 0) return "partial";
  return "ready";
}

/** Card copy for PageSpeed, derived only from stored runs and snapshots. */
export function describePageSpeed(facts: PageSpeedFacts): {
  status: EssentialStatus;
  evidence: string;
  gap: string;
} {
  const status = pageSpeedStatus(facts);
  if (!facts.implemented) {
    return {
      status,
      evidence: "No PageSpeed bridge is implemented in AOOS, so nothing has been measured here.",
      gap: "PageSpeed Insights would have to be implemented and called from AOOS before any figure exists.",
    };
  }
  const attemptText = `${facts.attempts} stored run attempt(s), ${facts.failures} failed, ${facts.successfulSnapshots} stored measurement(s).`;
  if (facts.successfulSnapshots > 0) {
    return {
      status,
      evidence: `The AOOS PageSpeed bridge is implemented and callable. ${attemptText}`,
      gap: "Measurements are manual and one click means one request, so there is no trend history yet.",
    };
  }
  if (facts.attempts > 0) {
    return {
      status,
      evidence: `The AOOS PageSpeed bridge is implemented and callable, and it has been exercised. ${attemptText} Latest provider error: ${facts.latestError ?? "not recorded"}.`,
      gap: "No Lighthouse figure is shown because every attempt failed at the provider. The anonymous quota has to clear, or a PageSpeed API key has to be configured, before a measurement exists.",
    };
  }
  return {
    status,
    evidence:
      "The AOOS PageSpeed bridge is implemented and callable. No run has been attempted yet, so nothing is measured.",
    gap: "An operator has to run one check from Measurement before any Lighthouse figure exists here.",
  };
}
