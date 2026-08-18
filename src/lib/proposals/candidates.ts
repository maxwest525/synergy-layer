/**
 * Pure candidate selection for the daily "propose from evidence" job.
 *
 * Nothing here calls a provider. It reads rows that were already stored from a
 * real Search Console read and decides which owned pages are worth proposing a
 * title/H1 change for, in a bounded, deterministic order.
 */

export type PageQueryRow = {
  keys?: unknown;
  clicks?: unknown;
  impressions?: unknown;
  position?: unknown;
};

export type ProposalCandidate = {
  url: string;
  impressions: number;
  clicks: number;
  /** Impression weighted average position across the stored rows. */
  position: number;
  queries: string[];
  reason: string;
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function canonical(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    parsed.search = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${path === "" ? "/" : path}`;
  } catch {
    return null;
  }
}

/**
 * Ranks owned pages by stored impressions, keeps only pages that are visible
 * but underperforming, and excludes anything already carrying a change request.
 */
export function selectProposalCandidates(input: {
  rows: PageQueryRow[];
  ownedHosts: string[];
  excludeUrls: string[];
  limit: number;
  minImpressions?: number;
}): ProposalCandidate[] {
  const minImpressions = input.minImpressions ?? 1;
  const owned = new Set(input.ownedHosts.map((host) => host.replace(/^www\./, "")));
  const excluded = new Set(
    input.excludeUrls.map((url) => canonical(url)).filter((url): url is string => Boolean(url)),
  );

  const byUrl = new Map<
    string,
    { impressions: number; clicks: number; positionWeight: number; queries: Map<string, number> }
  >();

  for (const row of input.rows) {
    if (!Array.isArray(row.keys) || typeof row.keys[0] !== "string") continue;
    const url = canonical(row.keys[0]);
    if (!url) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (owned.size > 0 && !owned.has(host)) continue;
    if (excluded.has(url)) continue;

    const impressions = num(row.impressions);
    const clicks = num(row.clicks);
    const position = num(row.position);
    const entry = byUrl.get(url) ?? {
      impressions: 0,
      clicks: 0,
      positionWeight: 0,
      queries: new Map<string, number>(),
    };
    entry.impressions += impressions;
    entry.clicks += clicks;
    entry.positionWeight += position * Math.max(impressions, 1);
    if (typeof row.keys[1] === "string") {
      entry.queries.set(row.keys[1], (entry.queries.get(row.keys[1]) ?? 0) + impressions);
    }
    byUrl.set(url, entry);
  }

  const candidates: ProposalCandidate[] = [];
  for (const [url, entry] of byUrl) {
    if (entry.impressions < minImpressions) continue;
    const position = entry.positionWeight / Math.max(entry.impressions, 1);
    const queries = [...entry.queries.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([query]) => query);
    const ctr = entry.impressions > 0 ? entry.clicks / entry.impressions : 0;
    candidates.push({
      url,
      impressions: entry.impressions,
      clicks: entry.clicks,
      position,
      queries,
      reason:
        entry.clicks === 0
          ? `${entry.impressions} impression(s) and no clicks at average position ${position.toFixed(1)}.`
          : `${entry.impressions} impression(s) at ${(ctr * 100).toFixed(1)}% click through, average position ${position.toFixed(1)}.`,
    });
  }

  candidates.sort((a, b) => b.impressions - a.impressions || a.url.localeCompare(b.url));
  return candidates.slice(0, Math.max(0, input.limit));
}
