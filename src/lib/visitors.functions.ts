import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ga4Row } from "./ga4-rule-checks";
import type { VisitorFacts } from "./visitors";

/**
 * One tenant-scoped reading of the stored analytics window.
 *
 * Reads three things and calls no provider: the newest stored snapshot, how
 * far back the stored snapshots go, and how many findings this property's
 * analytics has produced. Refreshing GA4 is a metered action and stays on the
 * tools page behind its own button.
 *
 * Returns null - not an empty reading - when nothing has been stored, so the
 * page can say which of the two it is.
 */

/** Read `metrics.rows` without trusting the shape of a jsonb column. */
function rowsOf(metrics: unknown): Ga4Row[] {
  if (metrics === null || typeof metrics !== "object") return [];
  const rows = (metrics as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const eventName = typeof row["eventName"] === "string" ? row["eventName"] : "";
    const pagePath = typeof row["pagePath"] === "string" ? row["pagePath"] : "";
    if (!pagePath) return [];
    return [
      {
        hostName: typeof row["hostName"] === "string" ? row["hostName"] : "",
        pagePath,
        eventName,
        eventCount: numberOf(row["eventCount"]),
        activeUsers: numberOf(row["activeUsers"]),
        sessions: numberOf(row["sessions"]),
      },
    ];
  });
}

/** A stored metric that is not a number is missing, not zero. */
function numberOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function wholeDaysBetween(earlier: string, later: string): number | null {
  const from = Date.parse(earlier);
  const to = Date.parse(later);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

export const getVisitorFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VisitorFacts | null> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const latestResult = await db
      .from("ga4_snapshots")
      .select("property, start_date, end_date, collected_at, metrics")
      .eq("tenant_id", tenantId)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latest = assertRead("GA4 snapshots", latestResult).data;
    if (!latest) return null;

    const [oldestResult, findingResult] = await Promise.all([
      db
        .from("ga4_snapshots")
        .select("collected_at")
        .eq("tenant_id", tenantId)
        .eq("property", latest.property)
        .order("collected_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      // Counted server-side so a page of rows can never be mistaken for a
      // total. Every state counts: a suggestion the operator rejected still
      // reached them.
      db
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("source_module", "ga4"),
    ]);

    const oldest = assertRead("GA4 snapshot history", oldestResult).data;
    const findings = assertRead("GA4 findings", findingResult);
    if (typeof findings.count !== "number") {
      const { EssentialsReadError } = await import("./essentials");
      throw new EssentialsReadError("GA4 findings", "the database returned no count");
    }

    const metrics = latest.metrics as Record<string, unknown> | null;
    return {
      property: latest.property,
      windowStart: latest.start_date,
      windowEnd: latest.end_date,
      collectedAt: latest.collected_at,
      totalSessions: numberOf(metrics?.["totalSessions"]),
      rows: rowsOf(metrics),
      truncated: metrics?.["truncated"] === true,
      // Null when only this one snapshot exists: "we have one reading" is a
      // different fact from "our readings span zero days".
      historyDays:
        oldest && oldest.collected_at !== latest.collected_at
          ? wholeDaysBetween(oldest.collected_at, latest.collected_at)
          : null,
      findings: findings.count,
    };
  });
