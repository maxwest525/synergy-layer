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
};

/** How many whole days sit between a change going live and the window closing. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

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

    const [cycleResult, windowResult, observationResult, changeResult, speedResult] =
      await Promise.all([
        db
          .from("change_measurement_cycles")
          .select("id, change_request_id, target_url, live_at")
          .eq("tenant_id", tenantId)
          .order("approved_at", { ascending: false })
          .limit(200),
        db
          .from("change_measurement_windows")
          .select("id, cycle_id, window_days, period_end_pt")
          .eq("tenant_id", tenantId)
          .order("window_days"),
        db
          .from("change_measurement_observations")
          .select("cycle_id, window_id, provider, status, payload, revision_number")
          .eq("tenant_id", tenantId)
          .eq("provider", "gsc")
          // Newest revision first, so the first row seen for a window is the
          // current one. Observations are appended, never edited.
          .order("revision_number", { ascending: false })
          .limit(1000),
        db.from("change_requests").select("id, title").eq("tenant_id", tenantId).limit(500),
        db
          .from("pagespeed_snapshots")
          .select("url, performance_score, collected_at")
          .eq("tenant_id", tenantId)
          .order("collected_at", { ascending: false })
          .limit(50),
      ]);

    const cycles = assertRead("Measurement cycles", cycleResult).data ?? [];
    const windows = assertRead("Measurement windows", windowResult).data ?? [];
    const observations = assertRead("Measurement observations", observationResult).data ?? [];
    const changes = assertRead("Change requests", changeResult).data ?? [];

    const titleById = new Map(changes.map((row) => [row.id, row.title]));
    const cycleById = new Map(cycles.map((row) => [row.id, row]));

    const newestByWindow = new Map<string, (typeof observations)[number]>();
    for (const observation of observations) {
      if (!newestByWindow.has(observation.window_id)) {
        newestByWindow.set(observation.window_id, observation);
      }
    }

    const outcomes: StoredOutcome[] = windows.flatMap((window) => {
      const cycle = cycleById.get(window.cycle_id);
      const observation = newestByWindow.get(window.id);
      // No cycle or no reading means nothing was measured, which is not the same
      // as a measurement of nothing. Those windows are left out entirely rather
      // than shown as zeros.
      if (!cycle || !observation) return [];

      const totals = ((observation.payload ?? {}) as { totals?: Record<string, unknown> }).totals;
      const liveAt = cycle.live_at;

      return [
        {
          changeId: cycle.change_request_id,
          title: titleById.get(cycle.change_request_id) ?? cycle.target_url,
          targetUrl: cycle.target_url,
          windowDays: window.window_days,
          daysSinceLive: liveAt === null ? 0 : daysBetween(liveAt, window.period_end_pt),
          impressions: numberOrZero(totals?.["impressions"]),
          clicks: numberOrZero(totals?.["clicks"]),
          // An "empty" observation covered a window in which the connected
          // property reported nothing for this page at all. That is a gap in
          // what we can see, not a measured zero, and grading it as a failure
          // would invent one.
          measurable: observation.status !== "empty" && liveAt !== null,
        },
      ];
    });

    const audit = await readPageAudit(db, tenantId);

    const speed: SpeedReading[] = (assertRead("Speed snapshots", speedResult).data ?? []).map(
      (row) => ({
        url: row.url,
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
    };
  });
