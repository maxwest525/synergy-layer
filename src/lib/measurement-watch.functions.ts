import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One applied change and the exact state of its outcome measurement. */
export type MeasurementWatchItem = {
  changeRequestId: string;
  title: string;
  targetUrl: string | null;
  /** Date the next follow-up evidence window becomes readable, in PT. */
  nextWindowAvailableOn: string | null;
  nextWindowDays: number | null;
  /** Follow-up windows whose evidence is already stored. */
  readyWindowDays: number[];
  followupObservations: number;
};

function ptToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

/**
 * Closes the reporting side of the change loop: for every change that is live
 * and being measured, it says when the next evidence window opens and whether
 * follow-up evidence is already stored. It never judges the outcome and never
 * changes state.
 */
export const getMeasurementWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MeasurementWatchItem[]> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { data: changes, error: changeError } = await context.supabase
      .from("change_requests")
      .select("id, title, target_url")
      .eq("tenant_id", tenantId)
      .eq("state", "applied");
    if (changeError) throw new Error(changeError.message);
    if (!changes || changes.length === 0) return [];

    const { data: cycles, error: cycleError } = await context.supabase
      .from("change_measurement_cycles")
      .select("id, change_request_id")
      .eq("tenant_id", tenantId)
      .in(
        "change_request_id",
        changes.map((change) => change.id),
      );
    if (cycleError) throw new Error(cycleError.message);

    const cycleIds = (cycles ?? []).map((cycle) => cycle.id);
    const [{ data: windows, error: windowError }, { data: observations, error: observationError }] =
      await Promise.all([
        cycleIds.length
          ? context.supabase
              .from("change_measurement_windows")
              .select("id, cycle_id, window_days, available_after_pt")
              .eq("tenant_id", tenantId)
              .in("cycle_id", cycleIds)
              .gt("window_days", 0)
              .order("window_days")
          : Promise.resolve({ data: [], error: null } as const),
        cycleIds.length
          ? context.supabase
              .from("change_measurement_observations")
              .select("window_id, cycle_id")
              .eq("tenant_id", tenantId)
              .in("cycle_id", cycleIds)
          : Promise.resolve({ data: [], error: null } as const),
      ]);
    if (windowError) throw new Error(windowError.message);
    if (observationError) throw new Error(observationError.message);

    const observedWindowIds = new Set((observations ?? []).map((row) => row.window_id));
    const today = ptToday();

    return changes.map((change) => {
      const cycle = (cycles ?? []).find((entry) => entry.change_request_id === change.id) ?? null;
      const cycleWindows = cycle
        ? (windows ?? []).filter((window) => window.cycle_id === cycle.id)
        : [];
      const ready = cycleWindows.filter((window) => observedWindowIds.has(window.id));
      const pending = cycleWindows.filter(
        (window) => !observedWindowIds.has(window.id) && window.available_after_pt > today,
      );
      const next = pending[0] ?? null;
      return {
        changeRequestId: change.id,
        title: change.title,
        targetUrl: change.target_url,
        nextWindowAvailableOn: next?.available_after_pt ?? null,
        nextWindowDays: next?.window_days ?? null,
        readyWindowDays: ready.map((window) => window.window_days),
        followupObservations: ready.length,
      };
    });
  });
