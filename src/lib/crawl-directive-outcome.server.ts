import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  gradeCrawlDirectiveChange,
  type CrawlDirectiveOutcome,
  type InspectionReading,
} from "./crawl-directive-outcome";

type Client = SupabaseClient<Database>;

/**
 * Reads the indexation evidence for one applied crawl-directive change.
 *
 * The wording lanes read Search Console performance rows. This lane reads
 * `search_console_url_inspections` instead, which stores the coverage and
 * fetch state per URL and which nothing consumed before now (recorded as an
 * open gap in the 2026-08-19 Search Essentials digest).
 *
 * Returns null when the change is not a crawl-directive change or has not
 * gone live, because there is then no outcome to state rather than an empty
 * one to render.
 */
export async function fetchCrawlDirectiveOutcome(
  client: Client,
  tenantId: string,
  changeRequestId: string,
): Promise<CrawlDirectiveOutcome | null> {
  const { data: row, error } = await client
    .from("change_requests")
    .select("proposal_type, evidence, live_at, target_url")
    .eq("id", changeRequestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.proposal_type !== "site.crawl_directives") return null;
  if (!row.live_at) return null;

  const affectedUrls = readAffectedUrls(row.evidence, row.target_url);

  const { data: inspections, error: inspectionError } = await client
    .from("search_console_url_inspections")
    .select("inspected_url, page_fetch_state, coverage_state, inspected_at")
    .eq("tenant_id", tenantId)
    .gt("inspected_at", row.live_at)
    .order("inspected_at", { ascending: false })
    .limit(500);
  if (inspectionError) throw new Error(inspectionError.message);

  const after: InspectionReading[] = (inspections ?? []).map((inspection) => ({
    url: inspection.inspected_url,
    pageFetchState: inspection.page_fetch_state,
    coverageState: inspection.coverage_state,
    inspectedAt: inspection.inspected_at,
  }));

  return gradeCrawlDirectiveChange({ affectedUrls, after });
}

/**
 * The paths the fix was meant to unblock, recorded on the proposal's own
 * evidence at draft time. Absolute URLs are built against the change's target
 * origin so they match what URL Inspection stores.
 */
function readAffectedUrls(evidence: unknown, targetUrl: string): string[] {
  if (!Array.isArray(evidence)) return [];
  let origin: string;
  try {
    origin = new URL(targetUrl).origin;
  } catch {
    return [];
  }

  for (const entry of evidence) {
    if (typeof entry !== "object" || entry === null) continue;
    const paths = (entry as Record<string, unknown>)["blockedPaths"];
    if (!Array.isArray(paths)) continue;
    return paths
      .filter((path): path is string => typeof path === "string")
      .map((path) => {
        try {
          return new URL(path, origin).toString();
        } catch {
          return null;
        }
      })
      .filter((url): url is string => url !== null);
  }
  return [];
}
