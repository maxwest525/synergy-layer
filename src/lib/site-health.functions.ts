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

/** How many changes are read. Named so the truncation can be reported, not hidden. */
const CYCLE_LIMIT = 200;

/**
 * How many whole days have passed between two instants.
 *
 * Used to answer "how long has this change been live", which is a question
 * about now. Measuring instead to the window's own end date always came up one
 * day short - `period_end_pt` is a Pacific calendar date derived from `live_at`,
 * so the difference is N days minus the timezone offset and the floor lands on
 * N-1. Every reading graded "too early", permanently, on every tenant.
 */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function totals(payload: {
  totals?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  return payload.totals;
}

/** The stored status, narrowed. Anything unrecognised is treated as incomplete. */
function readingStatusOf(value: unknown): "complete" | "partial" | "empty" {
  return value === "complete" || value === "partial" ? value : "empty";
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
    const now = new Date().toISOString();

    const [cycleResult, changeResult, speedResult] = await Promise.all([
      db
        .from("change_measurement_cycles")
        .select("id, change_request_id, target_url, live_at")
        .eq("tenant_id", tenantId)
        .order("approved_at", { ascending: false })
        .limit(CYCLE_LIMIT),
      db
        .from("change_requests")
        .select("id, title")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("pagespeed_snapshots")
        .select("url, strategy, performance_score, collected_at")
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(50),
    ]);

    const cycles = assertRead("Measurement cycles", cycleResult).data ?? [];
    const changes = assertRead("Change requests", changeResult).data ?? [];

    const titleById = new Map(changes.map((row) => [row.id, row.title]));
    const cycleById = new Map(cycles.map((row) => [row.id, row]));
    const cycleIds = cycles.map((row) => row.id);

    // Scoped to the cycles actually read, rather than fetched unbounded and then
    // dropped on a lookup miss. An unfiltered read kept whichever rows the server
    // returned and silently discarded windows whose cycle fell outside the page,
    // which showed up as a smaller count with no reason given.
    const [windowResult, observationResult] = await Promise.all([
      cycleIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : db
            .from("change_measurement_windows")
            .select("id, cycle_id, window_days, period_end_pt")
            .eq("tenant_id", tenantId)
            .in("cycle_id", cycleIds)
            .order("window_days"),
      cycleIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : db
            .from("change_measurement_observations")
            .select("cycle_id, window_id, status, payload, revision_number")
            .eq("tenant_id", tenantId)
            .eq("provider", "gsc")
            .in("cycle_id", cycleIds)
            // Grouped by window first, then newest revision within it.
            // Ordering by revision alone sorted globally, so the many windows
            // read exactly once sorted last and were the first to be cut.
            .order("window_id")
            .order("revision_number", { ascending: false }),
    ]);

    const windows = assertRead("Measurement windows", windowResult).data ?? [];
    const observations = assertRead("Measurement observations", observationResult).data ?? [];

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

      const payload = (observation.payload ?? {}) as {
        totals?: Record<string, unknown>;
        coverage?: Record<string, unknown>;
      };
      const liveAt = cycle.live_at;
      const status = readingStatusOf(observation.status);
      const expected = numberOrNull(payload.coverage?.["expectedDays"]);
      const observed = numberOrNull(payload.coverage?.["observedDays"]);

      return [
        {
          changeId: cycle.change_request_id,
          title: titleById.get(cycle.change_request_id) ?? cycle.target_url,
          targetUrl: cycle.target_url,
          windowDays: window.window_days,
          // Measured to now, because "has this been live long enough" is a
          // question about today, not about the date the window was cut for.
          daysSinceLive: liveAt === null ? 0 : daysBetween(liveAt, now),
          impressions: numberOrZero(totals(payload)?.["impressions"]),
          clicks: numberOrZero(totals(payload)?.["clicks"]),
          // Only a complete reading is judged. An "empty" one covered a window
          // the property reported nothing for, and a "partial" one under-counts
          // by however many days are missing; grading either turns a reporting
          // gap into a verdict.
          measurable: status === "complete" && liveAt !== null,
          readingStatus: status,
          coverage:
            expected === null || observed === null
              ? null
              : { expectedDays: expected, observedDays: observed },
        },
      ];
    });

    const audit = await readPageAudit(db, tenantId);

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
      truncated: cycles.length === CYCLE_LIMIT,
    };
  });
