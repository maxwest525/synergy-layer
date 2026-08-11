import type { Tone } from "@/components/os/primitives";

/**
 * Marketing Essentials status vocabulary. Deliberately small so an operator
 * reads the same six words everywhere. None of these words is derived from a
 * credential existing: configuration is not connection.
 */
export type EssentialStatus =
  | "live"
  | "partial"
  | "ready"
  | "local"
  | "not_wired"
  | "reference";

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
  if (system.credential_state === "configured" || system.credential_state === "encrypted_not_enumerated") {
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
 * Authority claim gate. A single referring domain is not an authority signal,
 * so the screen reports the sample size instead of inventing a score.
 */
export function backlinkAuthority(sample: BacklinkSample): {
  status: EssentialStatus;
  sufficient: boolean;
  note: string;
} {
  if (sample.snapshotCount <= 0) {
    return {
      status: "not_wired",
      sufficient: false,
      note: "No backlink snapshot has been collected yet.",
    };
  }
  const sufficient = sample.referringDomains >= 10 && sample.backlinks >= 25;
  if (sufficient) {
    return {
      status: "partial",
      sufficient: true,
      note: `Sample covers ${sample.referringDomains} referring domains across ${sample.backlinks} links.`,
    };
  }
  return {
    status: "partial",
    sufficient: false,
    note: `The stored sample is ${sample.referringDomains} referring domain(s) and ${sample.backlinks} link(s), which is too small to support an authority score. No score is shown.`,
  };
}

/** Recommended page changes: only concrete asset changes count. */
export function changeStatus(proposedCount: number, totalCount: number): EssentialStatus {
  if (totalCount <= 0) return "not_wired";
  return proposedCount > 0 ? "live" : "partial";
}
