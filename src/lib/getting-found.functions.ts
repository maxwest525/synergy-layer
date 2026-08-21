import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  countShownPages,
  topRows,
  type PageCoverage,
  type SearchListRow,
  type StoredSearchRow,
} from "./getting-found";

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
  /** Null when the window that would answer it has not been collected. */
  readonly coverage: PageCoverage | null;
  /** Null when analytics is not connected, which is not the same as no visits. */
  readonly sessions: number | null;
  /** Approved keywords on the tenant. Zero means nothing has been chosen to target. */
  readonly approvedKeywords: number;
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
      return {
        latestDate: null,
        queries: [],
        pages: [],
        coverage: null,
        sessions: null,
        approvedKeywords: 0,
      };
    }

    const [windowResult, observedResult, ga4Result, keywordResult] = await Promise.all([
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
        .eq("property", property)
        // A page the audit could not read is not a page we know about. Rows
        // stored with a reason - unrenderable, or disallowed by robots.txt -
        // would otherwise inflate the denominator and make a site of public
        // pages plus blocked admin pages diagnose as unreachable.
        .is("error", null),
      db
        .from("ga4_snapshots")
        .select("end_date, metrics")
        .eq("tenant_id", tenantId)
        .order("end_date", { ascending: false })
        .limit(1),
      db
        .from("tracked_keywords")
        .select("keyword", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true),
    ]);

    const windows = assertRead("Search Console window snapshots", windowResult).data ?? [];

    const matches = (row: (typeof windows)[number], dimensions: string[]) =>
      Array.isArray(row.dimensions) &&
      row.dimensions.length === dimensions.length &&
      dimensions.every((name, index) => row.dimensions[index] === name);

    /**
     * The newest collection that wrote both dimension sets.
     *
     * Taking each newest independently would pair an August list of search
     * terms with a July list of pages when a collection run failed partway,
     * and nothing on screen would say the two covered different months.
     */
    const completeDate =
      windows.find(
        (row) =>
          matches(row, ["query"]) &&
          windows.some(
            (other) => other.period_end_pt === row.period_end_pt && matches(other, ["page"]),
          ),
      )?.period_end_pt ?? null;

    const onCompleteDate = (dimensions: string[]) =>
      completeDate === null
        ? null
        : (windows.find((row) => row.period_end_pt === completeDate && matches(row, dimensions)) ??
          null);

    const queryWindow = onCompleteDate(["query"]);
    const pageWindow = onCompleteDate(["page"]);
    const pageRows = rowsOf(pageWindow?.payload);

    const observed = assertRead("Page observations", observedResult).data ?? [];
    const readable = new Set(
      observed.map((row) => row.url).filter((url): url is string => typeof url === "string"),
    );

    const ga4Metrics = (assertRead("Analytics snapshots", ga4Result).data?.[0]?.metrics ??
      null) as Record<string, unknown> | null;
    const rawSessions = ga4Metrics?.["totalSessions"];
    // A missing snapshot means analytics is not connected, which the diagnosis
    // has to tell apart from a measured zero.
    const sessions =
      typeof rawSessions === "number" && Number.isFinite(rawSessions) ? rawSessions : null;

    const approvedKeywords = assertRead("Approved keywords", keywordResult).count ?? 0;

    return {
      latestDate: completeDate,
      queries: topRows(rowsOf(queryWindow?.payload)),
      pages: topRows(pageRows),
      // Refused, not guessed at, in two cases: no page window collected, and no
      // page read successfully. Assembling zeros out of an absent read is how a
      // healthy site gets told none of its pages are findable.
      coverage:
        pageWindow === null || readable.size === 0
          ? null
          : {
              pagesKnown: readable.size,
              // Counted only among pages the audit actually read, so the share
              // this feeds is a share: a site with more pages in Search Console
              // than the audit's own limit cannot push it above one.
              pagesWithImpressions: countShownPages(pageRows, readable),
            },
      sessions,
      approvedKeywords,
    };
  });
