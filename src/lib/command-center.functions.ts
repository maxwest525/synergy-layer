import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CommandCenterFacts, Ga4Window } from "./command-center";
import { categoryForChangeRequest, categoryForFinding, ruleFromMetadata } from "./finding-router";
import { isObservationOnly } from "./recommendation-action";
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

    const [snapshotResult, ga4Result, changeResult, recommendationResult, systemResult, runResult] =
      await Promise.all([
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
          // Each row carries the whole snapshot blob, so this stays tight. The
          // comparison only ever uses the latest window and the one ending the day
          // before it starts; snapshots are daily, so 60 rows always spans the 28
          // days back to it, and spans further still when there are gaps.
          .limit(60),
        db
          .from("change_requests")
          .select(
            "id, title, state, target_url, proposal_type, recommendation_id, published_proof_at, rolled_back_at, created_at, updated_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(500),
        db
          .from("recommendations")
          .select(
            "id, title, state, source_module, metadata, issue_fingerprint, created_at, updated_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(500),
        // The two reads behind "All systems normal". Only rows the operator can
        // see in the tool estate count, so a hidden system never turns the light
        // red.
        db
          .from("tool_systems")
          .select("verification_state")
          .eq("tenant_id", tenantId)
          .eq("visible_in_aoos", true),
        db
          .from("measurement_runs")
          .select("status, started_at")
          .eq("tenant_id", tenantId)
          .order("started_at", { ascending: false })
          .limit(50),
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

    // Rolling a change back never clears `published_proof_at`, so proof alone
    // would keep counting a fix that is no longer on the page. The tile says
    // these are live now, so the count has to mean that.
    const fixesLive = changes.filter(
      (row) => row.published_proof_at !== null && row.rolled_back_at === null,
    ).length;
    const pagesImproved = new Set(
      changes
        .filter((row) => row.state === "verified")
        .map((row) => row.target_url)
        .filter((url): url is string => typeof url === "string" && url.length > 0),
    ).size;

    const audit = await readPageAudit(db, tenantId);
    const suppressionResult = await db
      .from("suggestion_suppressions")
      .select("fingerprint")
      .eq("tenant_id", tenantId);
    const suppressed = new Set(
      (assertRead("Ignored suggestions", suppressionResult).data ?? []).map(
        (row) => row.fingerprint,
      ),
    );
    const pagesNeedingFixes = new Set(
      audit.findings.flatMap((finding) => finding.pages.map((page) => page.url)),
    ).size;

    // --- What the status light is allowed to say ----------------------------

    const brokenConnections = (assertRead("Tool systems", systemResult).data ?? []).filter(
      (row) => row.verification_state === "failed",
    ).length;

    const failedRuns = (assertRead("Measurement runs", runResult).data ?? []).filter(
      (row) => row.status === "failed",
    ).length;

    // --- The queue ----------------------------------------------------------

    const recommendations = assertRead("Recommendations", recommendationResult).data ?? [];

    // A recommendation that already became a change request is represented by
    // that change request, so the same decision is never shown twice.
    const linkedRecommendationIds = new Set(
      changes
        .map((row) => row.recommendation_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    // Where each finding belongs, decided by its stored rule where one exists.
    const categoryByRecommendationId = new Map(
      recommendations.map(
        (row) => [row.id, categoryForFinding(row.source_module, row.metadata)] as const,
      ),
    );

    const changeSources: QueueSource[] = changes.map((row) => ({
      id: row.id,
      kind: "change",
      // A fix drafted from a finding stays with that finding rather than moving
      // to Your pages the moment it is drafted.
      categoryId: categoryForChangeRequest(
        row.proposal_type,
        row.recommendation_id === null
          ? null
          : (categoryByRecommendationId.get(row.recommendation_id) ?? null),
      ),
      title: row.title,
      targetUrl: row.target_url,
      storedState: row.state,
      fingerprint: null,
      severity: null,
      linkedChangeId: null,
      proposalType: row.proposal_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    }));

    const recommendationSources: QueueSource[] = recommendations.map((row) => ({
      id: row.id,
      kind: "recommendation",
      categoryId: categoryByRecommendationId.get(row.id) ?? "pages",
      title: row.title,
      targetUrl: null,
      storedState: row.state,
      fingerprint: row.issue_fingerprint,
      severity: null,
      // Carried so the queue can say which constraint this addresses, not only
      // how long it has been waiting.
      rule: ruleFromMetadata(row.metadata),
      observationOnly: isObservationOnly(row.metadata) || row.state === "observed",
      linkedChangeId: linkedRecommendationIds.has(row.id) ? row.id : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    }));

    const observedAt = audit.lastObservedAt ?? new Date().toISOString();

    const auditSources: QueueSource[] = audit.findings.map((finding) => ({
      id: `audit:${finding.check}`,
      kind: "audit",
      categoryId: "pages",
      title: finding.label,
      targetUrl: finding.pages[0]?.url ?? null,
      storedState: "proposed",
      fingerprint: `audit:${finding.check}`,
      // The check id is what decides whether a governed lane can draft this
      // finding's fix, so it travels with the row. Without it the card can
      // only ever offer "Not now", which is why every audit suggestion read
      // as a dead end.
      rule: finding.check,
      severity: finding.severity as AuditSeverity,
      linkedChangeId: null,
      suppressed: suppressed.has(`audit:${finding.check}`),
      createdAt: observedAt,
      updatedAt: observedAt,
    }));

    // Site-wide checks — robots.txt, the sitemap, unreadable pages. These were
    // already computed and already on screen inside the page-audit panel, but
    // they never reached the queue the operator actually works from, so a
    // sitemap listing pages Google has indexed none of said nothing out loud.
    const siteSources: QueueSource[] = audit.siteFindings.map((finding) => ({
      id: `site:${finding.check}`,
      kind: "audit",
      categoryId: "health",
      title: finding.label,
      targetUrl: null,
      storedState: "proposed",
      fingerprint: `site:${finding.check}`,
      severity: finding.severity as AuditSeverity,
      linkedChangeId: null,
      suppressed: suppressed.has(`site:${finding.check}`),
      createdAt: audit.siteObservedAt ?? observedAt,
      updatedAt: audit.siteObservedAt ?? observedAt,
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
      health: { brokenConnections, failedRuns },
      queueSources: [...changeSources, ...recommendationSources, ...auditSources, ...siteSources],
    };
  });

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
