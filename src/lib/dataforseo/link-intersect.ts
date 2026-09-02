import { BACKLINKS_CONFIG } from "./backlinks.server";

/**
 * Competitor link intersect: the domains that link to every tracked
 * competitor and not to the owned site, read from one stored
 * `backlinks_domain_intersection` snapshot. Pure, so it tests without mocks.
 *
 * Stated assumption: the item shape (`target` for the linking domain,
 * `domain_intersection` keyed by the target index with `rank`, `backlinks`,
 * `referring_pages`) is from the provider's documentation, not from a live
 * response this repo has diffed a fixture against. Every read is defensive:
 * an item without a readable linking domain is counted as unparsed, never
 * dropped to zero (LINK-4).
 */

/** One request, at the repo's own Backlinks request estimate. */
export function estimatedIntersectCostUsd(): number {
  return BACKLINKS_CONFIG.estimatedUsdPerRequest;
}

export type IntersectRow = {
  readonly domain: string;
  /** Per competitor: how many links that domain gives it, and the rank the provider assigns. */
  readonly byCompetitor: Record<string, { backlinks: number; rank: number | null }>;
  readonly linksTo: number;
};

export type ParsedIntersect = {
  readonly rows: IntersectRow[];
  readonly unparsed: number;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseLinkIntersect(
  items: readonly unknown[],
  targets: Readonly<Record<string, string>>,
): ParsedIntersect {
  const rows: IntersectRow[] = [];
  let unparsed = 0;
  for (const raw of items) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const domain = typeof item?.["target"] === "string" ? (item["target"] as string).trim() : "";
    if (!item || !domain) {
      unparsed += 1;
      continue;
    }
    const intersection =
      item["domain_intersection"] && typeof item["domain_intersection"] === "object"
        ? (item["domain_intersection"] as Record<string, unknown>)
        : {};
    const byCompetitor: Record<string, { backlinks: number; rank: number | null }> = {};
    for (const [index, competitor] of Object.entries(targets)) {
      const entry =
        intersection[index] && typeof intersection[index] === "object"
          ? (intersection[index] as Record<string, unknown>)
          : null;
      if (!entry) continue;
      byCompetitor[competitor] = {
        backlinks: num(entry["backlinks"]) ?? 0,
        rank: num(entry["rank"]),
      };
    }
    rows.push({ domain, byCompetitor, linksTo: Object.keys(byCompetitor).length });
  }
  return { rows, unparsed };
}
