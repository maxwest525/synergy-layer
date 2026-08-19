import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FindingEntry = {
  id: string;
  rule: string;
  target: string;
  periodEndPt: string;
  createdAt: string;
  recommendationId: string | null;
  recommendationTitle: string | null;
  recommendationState: string | null;
};

export type FindingsSummary = {
  findings: FindingEntry[];
  countsByRule: Record<string, number>;
  inspectionCoverage: {
    urlsInspected: number;
    notIndexed: number;
    canonicalMismatch: number;
    staleCrawl: number;
  };
};

/**
 * What the rules engine found and what the inspection sweep knows, for the
 * operator-facing findings panel. Reads stored rows only.
 */
export const getSearchFindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FindingsSummary> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const client = context.supabase;

    const [observationResult, inspectionResult] = await Promise.all([
      client
        .from("search_console_observations")
        .select(
          "id, rule, target, period_end_pt, created_at, recommendation_id, recommendations(id, title, state)",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      client
        .from("search_console_url_inspections")
        .select(
          "inspected_url, verdict, google_canonical, user_canonical, last_crawl_time, inspected_at",
        )
        .eq("tenant_id", tenantId)
        .order("inspected_at", { ascending: false })
        .limit(500),
    ]);
    if (observationResult.error) {
      throw new Error(`Rule findings could not be read: ${observationResult.error.message}`);
    }
    if (inspectionResult.error) {
      throw new Error(`Inspection coverage could not be read: ${inspectionResult.error.message}`);
    }

    const findings: FindingEntry[] = (observationResult.data ?? []).map((row) => {
      const recommendation = Array.isArray(row.recommendations)
        ? (row.recommendations[0] ?? null)
        : (row.recommendations ?? null);
      return {
        id: row.id,
        rule: row.rule,
        target: row.target,
        periodEndPt: row.period_end_pt,
        createdAt: row.created_at,
        recommendationId: row.recommendation_id,
        recommendationTitle: recommendation?.title ?? null,
        recommendationState: recommendation?.state ?? null,
      };
    });

    const countsByRule: Record<string, number> = {};
    for (const finding of findings) {
      countsByRule[finding.rule] = (countsByRule[finding.rule] ?? 0) + 1;
    }

    const latestByUrl = new Map<
      string,
      {
        verdict: string;
        googleCanonical: string | null;
        userCanonical: string | null;
        lastCrawlTime: string | null;
      }
    >();
    for (const row of inspectionResult.data ?? []) {
      if (!latestByUrl.has(row.inspected_url)) {
        latestByUrl.set(row.inspected_url, {
          verdict: row.verdict,
          googleCanonical: row.google_canonical,
          userCanonical: row.user_canonical,
          lastCrawlTime: row.last_crawl_time,
        });
      }
    }
    const staleCutoff = Date.now() - 30 * 86_400_000;
    let notIndexed = 0;
    let canonicalMismatch = 0;
    let staleCrawl = 0;
    for (const entry of latestByUrl.values()) {
      if (entry.verdict !== "PASS") notIndexed += 1;
      else if (
        entry.googleCanonical &&
        entry.userCanonical &&
        entry.googleCanonical !== entry.userCanonical
      )
        canonicalMismatch += 1;
      else if (entry.lastCrawlTime && new Date(entry.lastCrawlTime).getTime() < staleCutoff)
        staleCrawl += 1;
    }

    return {
      findings,
      countsByRule,
      inspectionCoverage: {
        urlsInspected: latestByUrl.size,
        notIndexed,
        canonicalMismatch,
        staleCrawl,
      },
    };
  });
