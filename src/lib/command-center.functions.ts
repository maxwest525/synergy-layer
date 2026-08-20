import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CommandCenterFacts, Ga4Window } from "./command-center";
import type { CategoryId } from "./categories";
import type { AuditSeverity, QueueSource } from "./suggestion-queue";

/**
 * One tenant-scoped read of everything the Command center shows.
 *
 * Every field is a count or a total of stored rows. No provider is called, so
 * this read is free and safe to run on every visit; the metered actions the
 * page offers (the page audit, drafting a fix) stay behind their own explicit
 * operator click, with their cost on the button.
 *
 * Every read is guarded: a failure throws and the route's error component says
 * so. A failed read must never arrive on screen as a zero.
 */
export const getCommandCenterFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommandCenterFacts> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");
    const { buildPeriodComparison } = await import("./search-console");
    const { readPageAudit } = await import("./page-audit.server");
    const { describeGa4Connection, readGa4EnvPresence, ga4PropertyForSearchConsoleProperty } =
      await import("./measurement/ga4");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const propertyResult = assertRead(
      "Search Console properties",
      await db
        .from("search_console_properties")
        .select("site_url, selected")
        .eq("tenant_id", tenantId),
    );
    const selectedProperty =
      propertyResult.data?.find((row) => row.selected) ?? propertyResult.data?.[0] ?? null;
    const property = selectedProperty?.site_url ?? null;

    const [snapshotResult, ga4Result, changeResult, recommendationResult] = await Promise.all([
      property === null
        ? Promise.resolve(null)
        : db
            .from("search_console_snapshots")
            .select("kind, period_end_pt, totals, collected_at")
            .eq("tenant_id", tenantId)
            .eq("property", property)
            .eq("kind", "property_totals")
            .order("period_end_pt", { ascending: false })
            .limit(400),
      db
        .from("ga4_snapshots")
        .select("start_date, end_date, metrics")
        .eq("tenant_id", tenantId)
        .order("end_date", { ascending: false })
        .limit(120),
      db
        .from("change_requests")
        .select(
          "id, title, state, target_url, proposal_type, recommendation_id, published_proof_at, created_at, updated_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("recommendations")
        .select("id, title, state, source_module, issue_fingerprint, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    // --- Getting found on Google -------------------------------------------

    const search =
      snapshotResult === null
        ? null
        : buildPeriodComparison(
            (assertRead("Search Console snapshots", snapshotResult).data ?? []).map((row) => {
              const totals = (row.totals ?? {}) as Record<string, unknown>;
              return {
                date: row.period_end_pt as string,
                clicks: numberOrZero(totals["clicks"]),
                impressions: numberOrZero(totals["impressions"]),
                ctr: numberOrNull(totals["ctr"]),
                position: numberOrNull(totals["position"]),
                collectedAt: row.collected_at as string,
              };
            }),
          );

    // --- Who visits your site ----------------------------------------------

    const ga4Rows = assertRead("Analytics snapshots", ga4Result).data ?? [];
    const ga4Snapshots: Ga4Window[] = ga4Rows.flatMap((row): Ga4Window[] => {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const sessions = numberOrNull(metrics["totalSessions"]);
      // A snapshot without a stored session total is not a zero-visit window.
      if (sessions === null || row.start_date === null || row.end_date === null) return [];
      return [{ startDate: row.start_date, endDate: row.end_date, sessions }];
    });

    const ga4Property = property === null ? null : ga4PropertyForSearchConsoleProperty(property);
    const ga4Connection = describeGa4Connection(
      readGa4EnvPresence(process.env),
      ga4Property,
      ga4Rows.length > 0,
      ga4Rows.length > 0,
    );

    // --- Your pages ---------------------------------------------------------

    const changes = assertRead("Change requests", changeResult).data ?? [];

    const fixesLive = changes.filter((row) => row.published_proof_at !== null).length;
    const pagesImproved = new Set(
      changes
        .filter((row) => row.state === "verified")
        .map((row) => row.target_url)
        .filter((url): url is string => typeof url === "string" && url.length > 0),
    ).size;

    const audit = await readPageAudit(db, tenantId);
    const pagesNeedingFixes = new Set(
      audit.findings.flatMap((finding) => finding.pages.map((page) => page.url)),
    ).size;

    // --- The queue ----------------------------------------------------------

    const recommendations = assertRead("Recommendations", recommendationResult).data ?? [];

    // A recommendation that already became a change request is represented by
    // that change request, so the same decision is never shown twice.
    const linkedRecommendationIds = new Set(
      changes
        .map((row) => row.recommendation_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    const changeSources: QueueSource[] = changes.map((row) => ({
      id: row.id,
      kind: "change",
      categoryId: categoryForProposalType(row.proposal_type),
      title: row.title,
      targetUrl: row.target_url,
      storedState: row.state,
      fingerprint: null,
      severity: null,
      linkedChangeId: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    }));

    const recommendationSources: QueueSource[] = recommendations.map((row) => ({
      id: row.id,
      kind: "recommendation",
      categoryId: categoryForSourceModule(row.source_module),
      title: row.title,
      targetUrl: null,
      storedState: row.state,
      fingerprint: row.issue_fingerprint,
      severity: null,
      linkedChangeId: linkedRecommendationIds.has(row.id) ? row.id : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    }));

    const auditSources: QueueSource[] = audit.findings.map((finding) => ({
      id: `audit:${finding.check}`,
      kind: "audit",
      categoryId: "pages",
      title: finding.label,
      targetUrl: finding.pages[0]?.url ?? null,
      storedState: "proposed",
      fingerprint: `audit:${finding.check}`,
      severity: finding.severity as AuditSeverity,
      linkedChangeId: null,
      createdAt: audit.lastObservedAt ?? new Date().toISOString(),
      updatedAt: audit.lastObservedAt ?? new Date().toISOString(),
    }));

    return {
      now: new Date().toISOString(),
      property,
      search,
      ga4: {
        connectionStatement: ga4Connection.statement,
        windowDays: 28,
        snapshots: ga4Snapshots,
      },
      changes: { fixesLive, pagesImproved },
      audit: { hasRun: audit.lastObservedAt !== null, pagesNeedingFixes },
      queueSources: [...changeSources, ...recommendationSources, ...auditSources],
    };
  });

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Which category owns a change request. `proposal_type` is the stored
 * discriminator, so this is a reading of the row rather than a guess.
 */
function categoryForProposalType(proposalType: string | null): CategoryId {
  return proposalType === "site.crawl_directives" ? "health" : "pages";
}

/**
 * Which category raised a recommendation. `source_module` is the stored
 * writer's own name; anything unrecognised lands in Your pages, which is where
 * page-level work belongs, rather than being dropped.
 */
function categoryForSourceModule(sourceModule: string | null): CategoryId {
  switch (sourceModule) {
    case "search-console":
      return "search";
    case "ga4":
      return "visitors";
    case "competitor-intelligence":
    case "dataforseo":
    case "ads.advertiser_resolution":
      return "competition";
    case "workflows":
      return "connections";
    default:
      return "pages";
  }
}
