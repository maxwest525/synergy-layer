import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Accessible properties with the permission level Google reports. */
export const listSearchConsoleProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { syncProperties } = await import("./search-console.server");
    return { properties: await syncProperties(context.supabase) };
  });

export const selectSearchConsoleProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ siteUrl: z.string().min(1), assetId: z.string().uuid().nullable().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { selectProperty } = await import("./search-console.server");
    return selectProperty(context.supabase, data.siteUrl, context.userId, data.assetId ?? null);
  });

export const runSearchConsoleObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { observeSearchConsole } = await import("./search-console-observe.server");
    return observeSearchConsole(context.supabase);
  });

/** Public read: connection state, selected property, and recent snapshots. */
export const getSearchConsoleState = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient, rows } = await import("./os.server");
  const client = createPublicServerClient();

  const properties = rows(
    await client
      .from("search_console_properties")
      .select("site_url, permission_level, eligible, selected, last_observed_at")
      .order("site_url"),
  );

  const snapshots = rows(
    await client
      .from("search_console_snapshots")
      .select("id, property, kind, dimensions, period_end_pt, returned_row_count, totals, collected_at")
      .order("collected_at", { ascending: false })
      .limit(12),
  );

  return { properties, snapshots };
});
