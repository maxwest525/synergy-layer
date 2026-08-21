import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { countOf, type StoredSearchRow } from "./getting-found";
import type { CheckFinding } from "./page-checks";
import type { PageEvidence } from "./your-pages";

/**
 * The reads the "Your pages" page needs and the Command center does not: what
 * Search Console reported per page, and what the audit found on each of them.
 *
 * It deliberately does not re-read the period comparison, the queue, or the
 * coverage counts. Those arrive through `useCommandCenter` and the shared
 * coverage read, so the diagnosis ordering this page uses is byte-for-byte the
 * one the search page uses, and the two can never disagree about what is
 * holding the site back.
 *
 * No provider is called. Every number is a stored row, and every read is
 * guarded, so a failure surfaces as an error rather than as a zero.
 */
export type YourPagesExtras = {
  readonly property: string | null;
  readonly pages: readonly PageEvidence[];
  readonly findings: readonly CheckFinding[];
  /** Every page the audit has actually read, so "clean" and "unread" stay apart. */
  readonly auditedUrls: readonly string[];
  readonly observedPages: number;
  readonly failedPages: number;
  readonly lastObservedAt: string | null;
  /** Null when no property is selected, so nothing was counted. */
  readonly fixesLive: number | null;
  /** Why orphan detection could not run at all, or null when it ran. */
  readonly orphanBailReason: string | null;
};

const EMPTY: YourPagesExtras = {
  property: null,
  pages: [],
  findings: [],
  auditedUrls: [],
  observedPages: 0,
  failedPages: 0,
  lastObservedAt: null,
  // Not zero: with no property selected nothing was counted, and a nought here
  // would read as "you have published no fixes".
  fixesLive: null,
  orphanBailReason: null,
};

function rowsOf(payload: unknown): StoredSearchRow[] {
  const rows = (payload as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as StoredSearchRow[]) : [];
}

function rateOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const getYourPagesExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YourPagesExtras> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");
    const { RULE_WINDOW_KIND } = await import("./search-console.server");
    const { readPageAudit, originForProperty } = await import("./page-audit.server");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const propertyResult = assertRead(
      "Search Console properties",
      await db
        .from("search_console_properties")
        .select("site_url, selected")
        .eq("tenant_id", tenantId)
        // Ordered, because `readPageAudit` and `listSitePages` both order here
        // and all three must agree on which property "the first one" is. Without
        // it, the page rows and the audit findings can describe different sites.
        .order("site_url"),
    );
    const property =
      (propertyResult.data?.find((row) => row.selected) ?? propertyResult.data?.[0])?.site_url ??
      null;
    if (property === null) return EMPTY;

    const [windowResult, changeResult, liveResult] = await Promise.all([
      db
        .from("search_console_snapshots")
        .select("dimensions, period_end_pt, payload")
        .eq("tenant_id", tenantId)
        .eq("property", property)
        // The same 28 day window the rules and the search page read. A single
        // day's page rows are as thin as the one-day reads that stopped every
        // rule from ever firing.
        .eq("kind", RULE_WINDOW_KIND)
        .order("period_end_pt", { ascending: false })
        .limit(30),
      db
        .from("change_requests")
        .select("id, target_url, state, created_at")
        .eq("tenant_id", tenantId)
        // Only a change still awaiting a decision is "waiting on this page". A
        // rejected or rolled back one is history, and advertising it as waiting
        // contradicts the decision the operator already made.
        .in("state", ["proposed", "approved"])
        .order("created_at", { ascending: false })
        .limit(500),
      // Counted by the database rather than by paging rows, so the number is a
      // total and not "however many fell inside the newest 500".
      db
        .from("change_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .not("published_proof_at", "is", null)
        .is("rolled_back_at", null)
        .like("target_url", `${originForProperty(property) ?? ""}%`),
    ]);

    const windows = assertRead("Search Console window snapshots", windowResult).data ?? [];
    const pageWindow =
      windows.find(
        (row) =>
          Array.isArray(row.dimensions) &&
          row.dimensions.length === 1 &&
          row.dimensions[0] === "page",
      ) ?? null;

    const changes = assertRead("Change requests", changeResult).data ?? [];

    // Newest first from the query, so the first change seen for a URL is the
    // one the operator would open.
    const changeByUrl = new Map<string, { id: string; state: string }>();
    for (const change of changes) {
      const url = change.target_url;
      if (typeof url !== "string" || url.length === 0) continue;
      if (!changeByUrl.has(url)) changeByUrl.set(url, { id: change.id, state: change.state });
    }

    // Rolling a change back never clears `published_proof_at`, so the query
    // above excludes rolled-back rows rather than trusting proof alone. It is
    // also scoped to this property's own addresses: `change_requests` has no
    // property column, so on a two-property tenant an unscoped count would
    // report the other site's fixes beside this site's pages.
    const fixesLive = assertRead("Published change requests", liveResult).count ?? 0;

    const pages: PageEvidence[] = rowsOf(pageWindow?.payload).flatMap((row) => {
      const url = row.keys?.[0];
      if (typeof url !== "string" || url.length === 0) return [];
      const change = changeByUrl.get(url) ?? null;
      return [
        {
          url,
          clicks: countOf(row.clicks),
          impressions: countOf(row.impressions),
          ctr: rateOf((row as { ctr?: unknown }).ctr),
          position: rateOf((row as { position?: unknown }).position),
          changeId: change?.id ?? null,
          changeState: change?.state ?? null,
        },
      ];
    });

    const audit = await readPageAudit(db, tenantId);

    return {
      property,
      pages,
      findings: audit.findings,
      auditedUrls: audit.observations.map((observation) => observation.url),
      observedPages: audit.observedPages,
      failedPages: audit.failedPages,
      lastObservedAt: audit.lastObservedAt,
      fixesLive,
      orphanBailReason: audit.orphanBailReason,
    };
  });
