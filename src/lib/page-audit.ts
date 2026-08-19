/**
 * Pure helpers for the site wide page metadata audit: what each page's browser
 * tab title and main headline actually say, and where the same wording is
 * reused across more than one page. Nothing here fetches or estimates.
 */

import type { CheckFinding, PageFacts } from "./page-checks";

export type PageMetadataObservation = {
  url: string;
  finalUrl: string | null;
  title: string | null;
  h1: string | null;
  renderedBy: string | null;
  error: string | null;
  observedAt: string;
  facts?: PageFacts | null;
};

export type DuplicateField = "title" | "h1";

export type DuplicateGroup = {
  field: DuplicateField;
  value: string;
  urls: string[];
};

export type PageAuditView = {
  property: string | null;
  observedPages: number;
  failedPages: number;
  lastObservedAt: string | null;
  observations: PageMetadataObservation[];
  duplicates: DuplicateGroup[];
  findings: CheckFinding[];
  instruction: string;
};

/** Case and whitespace insensitive comparison key. Empty wording is never a duplicate. */
export function normalizeHeadline(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim().toLowerCase();
  return collapsed.length > 0 ? collapsed : null;
}

/** Keeps only the newest observation per URL, newest first. */
export function selectLatestObservations(
  rows: PageMetadataObservation[],
): PageMetadataObservation[] {
  const newest = new Map<string, PageMetadataObservation>();
  for (const row of rows) {
    const existing = newest.get(row.url);
    if (!existing || row.observedAt > existing.observedAt) newest.set(row.url, row);
  }
  return [...newest.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

function groupField(
  observations: PageMetadataObservation[],
  field: DuplicateField,
): DuplicateGroup[] {
  const buckets = new Map<string, { value: string; urls: string[] }>();
  for (const observation of observations) {
    const raw = field === "title" ? observation.title : observation.h1;
    const key = normalizeHeadline(raw);
    if (!key || !raw) continue;
    const bucket = buckets.get(key);
    if (bucket) {
      if (!bucket.urls.includes(observation.url)) bucket.urls.push(observation.url);
    } else {
      buckets.set(key, { value: raw.trim(), urls: [observation.url] });
    }
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.urls.length > 1)
    .map((bucket) => ({ field, value: bucket.value, urls: [...bucket.urls].sort() }));
}

/** Every headline or tab title reused on more than one observed page. */
export function findDuplicateWording(
  observations: PageMetadataObservation[],
): DuplicateGroup[] {
  return [...groupField(observations, "h1"), ...groupField(observations, "title")].sort(
    (a, b) => b.urls.length - a.urls.length || a.value.localeCompare(b.value),
  );
}

export function buildAuditInstruction(input: {
  observedPages: number;
  failedPages: number;
  duplicates: DuplicateGroup[];
}): string {
  if (input.observedPages === 0) {
    return "No page wording has been read yet. Run the page wording audit to read every page Google reported.";
  }
  const worst = input.duplicates[0];
  if (!worst) {
    return `No repeated wording across ${input.observedPages} read pages. Nothing to fix here.`;
  }
  const label = worst.field === "h1" ? "headline" : "tab title";
  const pageCount = input.duplicates.reduce(
    (total, group) => total + group.urls.length,
    0,
  );
  return `${pageCount} pages share wording with another page. Start with the ${label} "${worst.value}" used on ${worst.urls.length} pages, then propose a distinct title and H1 for each.`;
}
