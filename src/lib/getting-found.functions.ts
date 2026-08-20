import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConstraintFacts } from "./binding-constraint";
import { countOf, topRows, type SearchListRow, type StoredSearchRow } from "./getting-found";

/**
 * The reads the "Getting found on Google" page needs and the Command center
 * does not: the search terms and pages behind the totals, and the counts the
 * binding-constraint diagnosis rests on.
 *
 * It deliberately does not re-read the period comparison or the queue. Those
 * already arrive through `useCommandCenter`, and reading them twice would let
 * the tiles disagree with the badge beside the category in the nav.
 *
 * No provider is called. Every number is a total of stored rows, and every read
 * is guarded, so a failure surfaces as an error rather than as a zero.
 */
export type GettingFoundExtras = {
  readonly latestDate: string | null;
  readonly queries: readonly SearchListRow[];
  readonly pages: readonly SearchListRow[];
  /** Null when too little is stored to attempt a diagnosis. */
  readonly constraintFacts: ConstraintFacts | null;
};

/** The stored rows of one window snapshot, or none when the payload is not one. */
function rowsOf(payload: unknown): StoredSearchRow[] {
  const rows = (payload as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as StoredSearchRow[]) : [];
}

export const getGettingFoundExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GettingFoundExtras> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");
    const { RULE_WINDOW_KIND } = await import("./search-console.server");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const propertyResult = assertRead(
      "Search Console properties",
      await db
        .from("search_console_properties")
        .select("site_url, selected")
        .eq("tenant_id", tenantId),
    );
    const property =
      (propertyResult.data?.find((row) => row.selected) ?? propertyResult.data?.[0])?.site_url ??
      null;

    if (property === null) {
      return { latestDate: null, queries: [], pages: [], constraintFacts: null };
    }

    const [windowResult, observedResult, ga4Result] = await Promise.all([
      db
        .from("search_console_snapshots")
        .select("dimensions, period_end_pt, payload, totals")
        .eq("tenant_id", tenantId)
        .eq("property", property)
        .eq("kind", RULE_WINDOW_KIND)
        .order("period_end_pt", { ascending: false })
        // Three dimension sets are written per collection, so this spans several
        // collections and the newest of each is picked out below.
        .limit(30),
      // What the page audit actually read. This is the honest denominator for
      // "how much of the site is reachable": pages nobody has ever observed
      // cannot be counted as either found or missing.
      db
        .from("page_metadata_observations")
        .select("url")
        .eq("tenant_id", tenantId)
        .eq("property", property),
      db
        .from("ga4_snapshots")
        .select("end_date, metrics")
        .eq("tenant_id", tenantId)
        .order("end_date", { ascending: false })
        .limit(1),
    ]);

    const windows = assertRead("Search Console window snapshots", windowResult).data ?? [];

    /** The newest snapshot written for one dimension set. */
    const newestFor = (dimensions: string[]) =>
      windows.find(
        (row) =>
          Array.isArray(row.dimensions) &&
          row.dimensions.length === dimensions.length &&
          dimensions.every((name, index) => row.dimensions[index] === name),
      ) ?? null;

    const queryWindow = newestFor(["query"]);
    const pageWindow = newestFor(["page"]);
    const pageRows = rowsOf(pageWindow?.payload);

    const latestDate =
      (queryWindow?.period_end_pt as string | undefined) ??
      (pageWindow?.period_end_pt as string | undefined) ??
      null;

    const observed = assertRead("Page observations", observedResult).data ?? [];
    const pagesKnown = new Set(
      observed.map((row) => row.url).filter((url): url is string => typeof url === "string"),
    ).size;

    const pagesWithImpressions = pageRows.filter((row) => countOf(row.impressions) > 0).length;

    const totals = (pageWindow?.totals ?? {}) as Record<string, unknown>;
    const impressions = countOf(totals["impressions"]);
    const clicks = countOf(totals["clicks"]);

    const ga4Metrics = (assertRead("Analytics snapshots", ga4Result).data?.[0]?.metrics ??
      null) as Record<string, unknown> | null;
    const rawSessions = ga4Metrics?.["totalSessions"];
    // A missing snapshot means analytics is not connected, which the diagnosis
    // has to tell apart from a measured zero.
    const sessions =
      typeof rawSessions === "number" && Number.isFinite(rawSessions) ? rawSessions : null;

    return {
      latestDate,
      queries: topRows(rowsOf(queryWindow?.payload)),
      pages: topRows(pageRows),
      // Without a page audit there is no denominator, so the diagnosis is
      // refused rather than run against a count of zero known pages.
      constraintFacts:
        pagesKnown === 0
          ? null
          : {
              pagesKnown,
              pagesWithImpressions,
              impressions,
              clicks,
              sessions,
              // Nothing in the estate measures a conversion yet. Null says that;
              // zero would claim we looked and found none.
              conversions: null,
            },
    };
  });
