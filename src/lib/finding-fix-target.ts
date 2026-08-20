/**
 * Resolves which page a rule finding's fix should target. Pure so it tests
 * without mocks. Page-targeted rules carry the URL directly; query-targeted
 * rules resolve to the page that earns the most impressions for that query
 * in the stored page+query snapshot.
 */

type PageQueryRow = {
  keys?: string[];
  impressions: number;
};

const PAGE_TARGET_RULES = new Set([
  "weak_ctr_page",
  "visibility_gain",
  "zero_impression_page",
  "index_coverage_drift",
]);

const QUERY_TARGET_RULES = new Set([
  "striking_distance_query",
  "position_loss",
  "possible_query_overlap",
]);

export type FixTarget =
  { ok: true; url: string; query: string | null } | { ok: false; reason: string };

export function deriveFixTarget(
  rule: string,
  target: string,
  pageQueryRows: PageQueryRow[],
): FixTarget {
  if (rule === "query_coverage_gap") {
    const [page, query] = target.split(" :: ");
    if (!page || !page.startsWith("http")) {
      return { ok: false, reason: `The finding target "${target}" holds no page URL.` };
    }
    return { ok: true, url: page, query: query ?? null };
  }

  if (PAGE_TARGET_RULES.has(rule)) {
    if (!target.startsWith("http")) {
      return { ok: false, reason: `The finding target "${target}" is not a page URL.` };
    }
    return { ok: true, url: target, query: null };
  }

  if (QUERY_TARGET_RULES.has(rule)) {
    let best: { url: string; impressions: number } | null = null;
    for (const row of pageQueryRows) {
      const page = row.keys?.[0];
      const query = row.keys?.[1];
      if (!page || query !== target) continue;
      if (!best || row.impressions > best.impressions) {
        best = { url: page, impressions: row.impressions };
      }
    }
    if (!best) {
      return {
        ok: false,
        reason: `No stored page earns impressions for "${target}", so there is no page to fix yet.`,
      };
    }
    return { ok: true, url: best.url, query: target };
  }

  return { ok: false, reason: `Rule "${rule}" has no governed fix path.` };
}
