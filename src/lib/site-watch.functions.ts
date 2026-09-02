import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SiteWatchSummary = {
  property: string | null;
  lastObservedOn: string | null;
  lastObservedAt: string | null;
  pagesRead: number;
  pagesUnanswered: number;
  nightsStored: number;
  lastRun: { status: string; error: string | null; startedAt: string } | null;
};

/** What the nightly live-site read has stored for this tenant, through the caller's own client. */
export const getSiteWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteWatchSummary> => {
    const { requireTenantId } = await import("./tenant.server");
    const { getSelectedProperty } = await import("./search-console.server");
    const tenantId = await requireTenantId(context.supabase);
    const property = await getSelectedProperty(context.supabase, tenantId);
    const [dates, runs] = await Promise.all([
      context.supabase
        .from("site_watch_reads")
        .select("observed_on, observed_at, error")
        .eq("tenant_id", tenantId)
        .order("observed_on", { ascending: false })
        .limit(2000),
      context.supabase
        .from("measurement_runs")
        .select("status, error, started_at")
        .eq("tenant_id", tenantId)
        .eq("provider", "site_watch")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    if (dates.error) throw new Error(`Could not read the live-site reads: ${dates.error.message}`);
    if (runs.error) throw new Error(`Could not read the live-site runs: ${runs.error.message}`);
    const rows = dates.data ?? [];
    const newest = rows[0]?.observed_on ?? null;
    const tonight = rows.filter((row) => row.observed_on === newest);
    const lastRun = runs.data?.[0] ?? null;
    return {
      property,
      lastObservedOn: newest,
      lastObservedAt: tonight[0]?.observed_at ?? null,
      pagesRead: tonight.length,
      pagesUnanswered: tonight.filter((row) => row.error !== null).length,
      nightsStored: new Set(rows.map((row) => row.observed_on)).size,
      lastRun: lastRun
        ? { status: lastRun.status, error: lastRun.error, startedAt: lastRun.started_at }
        : null,
    };
  });

/** Read the live site now. Free: it fetches the tenant's own pages. An operator's click. */
export const runSiteWatchNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const { getSelectedProperty } = await import("./search-console.server");
    const { readLiveSite } = await import("./site-watch.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await requireTenantId(context.supabase);
    const property = await getSelectedProperty(context.supabase, tenantId);
    if (!property) {
      throw new Error("No Search Console property is selected, so there is no site to read.");
    }
    return readLiveSite(supabaseAdmin, { tenantId, property, actorId: context.userId });
  });
