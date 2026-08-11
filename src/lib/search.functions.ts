import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One Search Console row as Google returns it, narrowed to what we display. */
export type SearchRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type DailyTotals = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  collectedAt: string;
};

export type SitemapEntry = {
  path: string;
  type: string | null;
  submitted: number | null;
  indexed: number | null;
  warnings: number | null;
  errors: number | null;
  isPending: boolean;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
};

type SnapshotRow = {
  kind: string;
  dimensions: string[] | null;
  period_end_pt: string;
  returned_row_count: number;
  totals: unknown;
  payload: unknown;
  collected_at: string;
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readRows(payload: unknown): SearchRow[] {
  const container = (payload ?? {}) as { rows?: unknown };
  if (!Array.isArray(container.rows)) return [];
  return container.rows.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      keys: Array.isArray(row['keys']) ? row['keys'].map((key) => String(key)) : [],
      clicks: num(row['clicks']),
      impressions: num(row['impressions']),
      ctr: num(row['ctr']),
      position: num(row['position']),
    };
  });
}

function readSitemaps(payload: unknown): SitemapEntry[] {
  const container = (payload ?? {}) as { sitemap?: unknown };
  if (!Array.isArray(container.sitemap)) return [];
  return container.sitemap.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const contents = Array.isArray(item['contents']) ? (item['contents'] as Record<string, unknown>[]) : [];
    const submitted = contents.reduce<number | null>(
      (sum, block) => (optionalNum(block['submitted']) === null ? sum : (sum ?? 0) + num(block['submitted'])),
      null,
    );
    const indexed = contents.reduce<number | null>(
      (sum, block) => (optionalNum(block['indexed']) === null ? sum : (sum ?? 0) + num(block['indexed'])),
      null,
    );
    return {
      path: String(item['path'] ?? "Unknown sitemap"),
      type: optionalText(item['type']),
      submitted,
      indexed,
      warnings: optionalNum(item['warnings']),
      errors: optionalNum(item['errors']),
      isPending: item['isPending'] === true,
      lastSubmitted: optionalText(item['lastSubmitted']),
      lastDownloaded: optionalText(item['lastDownloaded']),
    };
  });
}

function matches(snapshot: SnapshotRow, kind: string, dimensions: string[]): boolean {
  const stored = snapshot.dimensions ?? [];
  return (
    snapshot.kind === kind &&
    stored.length === dimensions.length &&
    dimensions.every((dimension, index) => stored[index] === dimension)
  );
}

/**
 * Read-only Search workspace payload. Everything here is what Google Search
 * Console already reported and we already stored: no provider calls, no
 * derived scores, no trends.
 */
export const getSearchWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const client = context.supabase;

    const propertyResult = await client
      .from("search_console_properties")
      .select("site_url, permission_level, eligible, selected, last_observed_at")
      .eq("tenant_id", tenantId)
      .order("site_url");
    if (propertyResult.error) {
      throw new Error(`Search Console properties could not be read: ${propertyResult.error.message}`);
    }

    const selectedProperty =
      propertyResult.data?.find((property) => property.selected) ?? propertyResult.data?.[0] ?? null;

    if (!selectedProperty) {
      return {
        property: null,
        dailyTotals: [] as DailyTotals[],
        latestDate: null as string | null,
        collectedAt: null as string | null,
        pages: [] as SearchRow[],
        queries: [] as SearchRow[],
        pageQueries: [] as SearchRow[],
        devices: [] as SearchRow[],
        countries: [] as SearchRow[],
        sitemaps: [] as SitemapEntry[],
        snapshotCount: 0,
      };
    }

    const snapshotResult = await client
      .from("search_console_snapshots")
      .select("kind, dimensions, period_end_pt, returned_row_count, totals, payload, collected_at")
      .eq("tenant_id", tenantId)
      .eq("property", selectedProperty.site_url)
      .order("period_end_pt", { ascending: false });
    if (snapshotResult.error) {
      throw new Error(`Search Console snapshots could not be read: ${snapshotResult.error.message}`);
    }

    const snapshots = (snapshotResult.data ?? []) as unknown as SnapshotRow[];

    const dailyTotals: DailyTotals[] = snapshots
      .filter((snapshot) => snapshot.kind === "property_totals")
      .map((snapshot) => {
        const totals = (snapshot.totals ?? {}) as Record<string, unknown>;
        return {
          date: snapshot.period_end_pt,
          clicks: num(totals['clicks']),
          impressions: num(totals['impressions']),
          ctr: num(totals['ctr']),
          position: num(totals['position']),
          collectedAt: snapshot.collected_at,
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const latestDate = dailyTotals[0]?.date ?? snapshots[0]?.period_end_pt ?? null;
    const latest = snapshots.filter((snapshot) => snapshot.period_end_pt === latestDate);

    const rowsFor = (kind: string, dimensions: string[]): SearchRow[] => {
      const snapshot = latest.find((candidate) => matches(candidate, kind, dimensions));
      return snapshot ? readRows(snapshot.payload) : [];
    };

    const sitemapSnapshot = latest.find((snapshot) => matches(snapshot, "dimensional_rows", ["sitemap"]));

    return {
      property: {
        siteUrl: selectedProperty.site_url,
        permissionLevel: selectedProperty.permission_level,
        eligible: selectedProperty.eligible,
        lastObservedAt: selectedProperty.last_observed_at,
      },
      dailyTotals,
      latestDate,
      collectedAt: latest[0]?.collected_at ?? null,
      pages: rowsFor("dimensional_rows", ["page"]),
      queries: rowsFor("dimensional_rows", ["query"]),
      pageQueries: rowsFor("page_query", ["page", "query"]),
      devices: rowsFor("dimensional_rows", ["device"]),
      countries: rowsFor("dimensional_rows", ["country"]),
      sitemaps: sitemapSnapshot ? readSitemaps(sitemapSnapshot.payload) : [],
      snapshotCount: snapshots.length,
    };
  });
