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

/** Read-only provider action: inspect Google's indexed version of one owned URL. */
export const inspectSearchConsoleUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ url: z.string().min(1).max(2048) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { getSelectedProperty, inspectUrl } = await import("./search-console.server");
    const property = await getSelectedProperty(context.supabase);
    if (!property) throw new Error("Select a Search Console property before inspecting a URL.");
    return { inspection: await inspectUrl(context.supabase, property, data.url, context.userId) };
  });

/** Explicit provider write: submit or resubmit one owned sitemap after UI confirmation. */
export const submitSearchConsoleSitemap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ sitemapUrl: z.string().min(1).max(2048) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { getSelectedProperty, submitSitemap } = await import("./search-console.server");
    const property = await getSelectedProperty(context.supabase);
    if (!property) throw new Error("Select a Search Console property before submitting a sitemap.");
    return {
      submission: await submitSitemap(context.supabase, property, data.sitemapUrl, context.userId),
    };
  });

/** Operator read: connection state, selected property, and recent snapshots. */
export const getSearchConsoleState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rows } = await import("./os.server");
    const client = context.supabase;

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

