import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SitemapSummary, SystemFacts } from "./essentials";

export type EssentialsFacts = {
  property: {
    siteUrl: string;
    permissionLevel: string;
    lastObservedAt: string | null;
  } | null;
  propertyCount: number;
  gsc: {
    snapshotCount: number;
    latestDate: string | null;
    collectedAt: string | null;
    totalsDays: number;
    latestClicks: number;
    latestImpressions: number;
    pageRows: number;
    queryRows: number;
    sitemapCount: number;
    sitemaps: SitemapSummary;
  };
  changes: {
    total: number;
    proposed: number;
    latest: { id: string; title: string; targetUrl: string; state: string; proposedAt: string } | null;
  };
  keywords: { tracked: number; pendingCandidates: number; latestCandidateAt: string | null };
  serp: { snapshots: number; latestAt: string | null };
  backlinks: {
    snapshots: number;
    latestAt: string | null;
    referringDomains: number;
    backlinks: number;
    spamScore: number | null;
    storedSufficient: boolean | null;
  };
  systems: Record<string, SystemFacts | null>;
};


const SYSTEM_KEYS = [
  "api.search_console",
  "api.pagespeed_insights",
  "api.chrome_ux_report",
  "sys.openseo",
  "api.ga4_data",
  "api.ga_admin",
  "api.google_tag_manager",
  "api.google_ads_v25",
  "api.dataforseo_v3",
] as const;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * One tenant-scoped read for the Marketing Essentials screen. Everything is a
 * stored row: no provider is called, nothing is written, and no count is
 * hardcoded.
 */
export const getEssentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EssentialsFacts> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead, summarizeSitemaps } = await import("./essentials");
    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    // The selected property decides which snapshots belong to this screen, so
    // it is resolved before the snapshot read rather than filtered afterwards.
    const properties = assertRead(
      "Search Console properties",
      await db
        .from("search_console_properties")
        .select("site_url, permission_level, selected, last_observed_at")
        .eq("tenant_id", tenantId),
    );
    const propertyRows = properties.data ?? [];
    const selected = propertyRows.find((row) => row.selected) ?? propertyRows[0] ?? null;

    const [gscSnapshots, changeRows, trackedKeywords, keywordCandidates, dfs, systems] =
      await Promise.all([
        selected
          ? db
              .from("search_console_snapshots")
              .select("kind, dimensions, period_end_pt, returned_row_count, totals, collected_at, payload")
              .eq("tenant_id", tenantId)
              .eq("property", selected.site_url)
              .order("period_end_pt", { ascending: false })
              .limit(500)
          : Promise.resolve({ data: [], error: null } as const),
        db
          .from("change_requests")
          .select("id, title, target_url, state, proposed_at")
          .eq("tenant_id", tenantId)
          .order("proposed_at", { ascending: false })
          .limit(50),
        db.from("tracked_keywords").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("active", true),
        db
          .from("keyword_candidates")
          .select("created_at")
          .eq("tenant_id", tenantId)
          .eq("review_state", "pending")
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("dataforseo_snapshots")
          .select("kind, totals, collected_at")
          .eq("tenant_id", tenantId)
          .order("collected_at", { ascending: false })
          .limit(200),
        db
          .from("tool_systems")
          .select(
            "stable_key, name, installed_state, credential_state, verification_state, aoos_connection_state, implemented_state",
          )
          .eq("tenant_id", tenantId)
          .eq("visible_in_aoos", true)
          .in("stable_key", SYSTEM_KEYS as unknown as string[]),
      ]);

    assertRead("Search Console snapshots", gscSnapshots);
    assertRead("Change requests", changeRows);
    assertRead("Tracked keywords", trackedKeywords);
    assertRead("Keyword candidates", keywordCandidates);
    assertRead("DataForSEO snapshots", dfs);
    assertRead("Tool systems catalog", systems);

    const snapshots = gscSnapshots.data ?? [];
    const totals = snapshots.filter((row) => row.kind === "property_totals");
    const latestDate = totals[0]?.period_end_pt ?? snapshots[0]?.period_end_pt ?? null;
    const latestTotals = (totals[0]?.totals ?? {}) as Record<string, unknown>;
    const latest = snapshots.filter((row) => row.period_end_pt === latestDate);
    const dimensionMatch = (row: (typeof snapshots)[number], dimension: string) =>
      row.kind === "dimensional_rows" && (row.dimensions ?? []).length === 1 && (row.dimensions ?? [])[0] === dimension;
    const sitemapRow = latest.find((row) => dimensionMatch(row, "sitemap")) ?? null;
    const sitemaps = summarizeSitemaps(sitemapRow?.payload ?? null);

    const changes = changeRows.data ?? [];
    const proposed = changes.filter((row) => row.state === "proposed");
    const headline = proposed[0] ?? changes[0] ?? null;

    const dfsRows = dfs.data ?? [];
    const serpRows = dfsRows.filter((row) => row.kind === "serp_organic");
    const backlinkRows = dfsRows.filter((row) => row.kind.startsWith("backlinks_"));
    const summary = (backlinkRows.find((row) => row.kind === "backlinks_summary")?.totals ?? {}) as Record<string, unknown>;
    const evidenceTotals = (backlinkRows.find((row) => row.kind === "backlinks_evidence")?.totals ?? null) as
      | Record<string, unknown>
      | null;
    const storedSufficient =
      evidenceTotals && typeof evidenceTotals['sufficient'] === "boolean"
        ? (evidenceTotals['sufficient'] as boolean)
        : null;

    const systemMap: Record<string, SystemFacts | null> = {};
    for (const key of SYSTEM_KEYS) {
      const row = (systems.data ?? []).find((entry) => entry.stable_key === key);
      systemMap[key] = row
        ? {
            key: row.stable_key,
            name: row.name,
            installed_state: row.installed_state,
            credential_state: row.credential_state,
            verification_state: row.verification_state,
            aoos_connection_state: row.aoos_connection_state,
            implemented_state: row.implemented_state,
          }
        : null;
    }


    return {
      property: selected
        ? {
            siteUrl: selected.site_url,
            permissionLevel: selected.permission_level,
            lastObservedAt: selected.last_observed_at,
          }
        : null,
      propertyCount: propertyRows.length,
      gsc: {
        snapshotCount: snapshots.length,
        latestDate,
        collectedAt: totals[0]?.collected_at ?? snapshots[0]?.collected_at ?? null,
        totalsDays: totals.length,
        latestClicks: num(latestTotals['clicks']),
        latestImpressions: num(latestTotals['impressions']),
        pageRows: latest.find((row) => dimensionMatch(row, "page"))?.returned_row_count ?? 0,
        queryRows: latest.find((row) => dimensionMatch(row, "query"))?.returned_row_count ?? 0,
        sitemapCount: sitemapRow?.returned_row_count ?? 0,
        sitemaps,

      },
      changes: {
        total: changes.length,
        proposed: proposed.length,
        latest: headline
          ? {
              id: headline.id,
              title: headline.title,
              targetUrl: headline.target_url,
              state: headline.state,
              proposedAt: headline.proposed_at,
            }
          : null,
      },
      keywords: {
        tracked: trackedKeywords.count ?? 0,
        pendingCandidates: (keywordCandidates.data ?? []).length,
        latestCandidateAt: keywordCandidates.data?.[0]?.created_at ?? null,
      },
      serp: { snapshots: serpRows.length, latestAt: serpRows[0]?.collected_at ?? null },
      backlinks: {
        snapshots: backlinkRows.length,
        latestAt: backlinkRows[0]?.collected_at ?? null,
        referringDomains: num(summary['referring_domains']),
        backlinks: num(summary['backlinks']),
        spamScore:
          typeof summary['backlinks_spam_score'] === "number" ? summary['backlinks_spam_score'] : null,
        storedSufficient,
      },

      systems: systemMap,
    };
  });
