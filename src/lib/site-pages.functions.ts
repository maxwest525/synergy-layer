import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The page inventory for the selected Search Console property: every page
 * Google reported on the latest finalized day, joined to any change request
 * already open or applied against that exact URL. Every number is a stored
 * row; nothing here is estimated.
 */
export type SitePage = {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  changeId: string | null;
  changeState: string | null;
};

export type SitePagesView = {
  property: string | null;
  latestDate: string | null;
  pages: SitePage[];
  instruction: string;
};

const empty: SitePagesView = {
  property: null,
  latestDate: null,
  pages: [],
  instruction: "Connect Search Console before this list can show real pages.",
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRows(payload: unknown): {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
}[] {
  const rows =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>)["rows"] : null;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const keys = record["keys"];
      const url = Array.isArray(keys) && typeof keys[0] === "string" ? keys[0] : null;
      if (!url) return null;
      return {
        url,
        clicks: num(record["clicks"]),
        impressions: num(record["impressions"]),
        ctr: optionalNum(record["ctr"]),
        position: optionalNum(record["position"]),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export const listSitePages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SitePagesView> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const client = context.supabase;

    const propertyResult = await client
      .from("search_console_properties")
      .select("site_url, selected")
      .eq("tenant_id", tenantId)
      .order("site_url");
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    const property =
      propertyResult.data?.find((row) => row.selected) ?? propertyResult.data?.[0] ?? null;
    if (!property) return empty;

    const [snapshotResult, changeResult] = await Promise.all([
      client
        .from("search_console_snapshots")
        .select("kind, dimensions, period_end_pt, payload")
        .eq("tenant_id", tenantId)
        .eq("property", property.site_url)
        .eq("kind", "dimensional_rows")
        .order("period_end_pt", { ascending: false })
        .limit(40),
      client
        .from("change_requests")
        .select("id, target_url, state, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (snapshotResult.error) throw new Error(snapshotResult.error.message);
    if (changeResult.error) throw new Error(changeResult.error.message);

    const pageSnapshots = (snapshotResult.data ?? []).filter((snapshot) => {
      const dimensions = snapshot.dimensions;
      return Array.isArray(dimensions) && dimensions.length === 1 && dimensions[0] === "page";
    });
    const newest = pageSnapshots[0] ?? null;
    if (!newest) {
      return {
        property: property.site_url,
        latestDate: null,
        pages: [],
        instruction:
          "No page rows stored yet. Run the Search Console observation to pull the page list.",
      };
    }

    const changeByUrl = new Map<string, { id: string; state: string }>();
    for (const change of changeResult.data ?? []) {
      if (!changeByUrl.has(change.target_url)) {
        changeByUrl.set(change.target_url, { id: change.id, state: change.state });
      }
    }

    const pages: SitePage[] = readRows(newest.payload)
      .map((row) => {
        const change = changeByUrl.get(row.url) ?? null;
        return {
          ...row,
          changeId: change?.id ?? null,
          changeState: change?.state ?? null,
        };
      })
      .sort((a, b) => b.impressions - a.impressions);

    return {
      property: property.site_url,
      latestDate: newest.period_end_pt,
      pages,
      instruction:
        pages.length > 0
          ? "Pick the page with the most impressions and the weakest position, then propose its title and H1 edit."
          : "Google returned no page rows on the latest finalized day.",
    };
  });
