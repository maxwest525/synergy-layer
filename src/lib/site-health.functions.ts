import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SiteFinding } from "./site-checks";
import type { SpeedReading, StoredOutcome } from "./site-health";

/**
 * The reads the "Site health" page needs.
 *
 * The measurement pipeline has been writing readings into
 * `change_measurement_observations` for every approved change, at every stored
 * window, for as long as it has existed. Nothing has ever read them back. This
 * does, which is what turns an approval queue into something that can be held
 * to account.
 *
 * No provider is called. Every number is a stored row, and every read is
 * guarded, so a failure surfaces as an error rather than as a zero.
 */
export type SiteHealthExtras = {
  readonly property: string | null;
  readonly siteFindings: readonly SiteFinding[];
  readonly siteObservedAt: string | null;
  readonly outcomes: readonly StoredOutcome[];
  readonly speed: readonly SpeedReading[];
  /** True when a read hit its own limit, so the counts are a floor, not a total. */
  readonly truncated: boolean;
};

function scoreOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const getSiteHealthExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteHealthExtras> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");
    const { readPageAudit } = await import("./page-audit.server");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;
    const now = new Date().toISOString();
    const audit = await readPageAudit(db, tenantId);

    const { fetchStoredOutcomes } = await import("./change-outcomes.server");
    const [{ outcomes, truncated }, speedResult] = await Promise.all([
      fetchStoredOutcomes(db, tenantId, now, audit.property),
      db
        .from("pagespeed_snapshots")
        .select("url, strategy, performance_score, collected_at")
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(50),
    ]);

    const speed: SpeedReading[] = (assertRead("Speed snapshots", speedResult).data ?? []).map(
      (row) => ({
        url: row.url,
        strategy: row.strategy,
        performanceScore: scoreOf(row.performance_score),
        collectedAt: row.collected_at,
      }),
    );

    return {
      property: audit.property,
      siteFindings: audit.siteFindings,
      siteObservedAt: audit.siteObservedAt,
      outcomes,
      speed,
      truncated,
    };
  });
