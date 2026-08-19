import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { extractPageFacts, evaluatePages, groupFindings, buildAuditHeadline, type PageFacts } from "./page-checks";
import {
  buildAuditInstruction,
  findDuplicateWording,
  selectLatestObservations,
  type PageAuditView,
  type PageMetadataObservation,
} from "./page-audit";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";

/** Renders one live page and returns its raw HTML and text. Throws with the real reason. */
async function scrapePage(url: string, key: string): Promise<{ html: string; markdown: string; finalUrl: string }> {
  const response = await fetch(FIRECRAWL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["rawHtml", "markdown"],
      onlyMainContent: false,
      waitFor: 3000,
      maxAge: 0,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Firecrawl responded ${response.status}, so nothing was read.`);
  let parsed: {
    success?: boolean;
    error?: string;
    data?: {
      rawHtml?: string;
      markdown?: string;
      metadata?: { sourceURL?: string; url?: string; statusCode?: number };
    };
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error("Firecrawl returned an unreadable response, so nothing was read.");
  }
  if (parsed.success === false) {
    throw new Error(`Firecrawl could not render the page: ${parsed.error ?? "no reason given"}.`);
  }
  const status = parsed.data?.metadata?.statusCode;
  if (typeof status === "number" && (status < 200 || status >= 300)) {
    throw new Error(`The public page returned HTTP ${status} when rendered.`);
  }
  return {
    html: parsed.data?.rawHtml ?? "",
    markdown: parsed.data?.markdown ?? "",
    finalUrl: parsed.data?.metadata?.sourceURL ?? parsed.data?.metadata?.url ?? url,
  };
}

function factsFromDetails(details: unknown): PageFacts | null {
  if (!details || typeof details !== "object") return null;
  return details as PageFacts;
}

type Client = SupabaseClient<Database>;

/** Upper bound on pages read in one audit run so a single click cannot fan out unbounded. */
export const AUDIT_PAGE_LIMIT = 40;

function payloadPageUrls(payload: unknown): string[] {
  const rows =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>)["rows"] : null;
  if (!Array.isArray(rows)) return [];
  const ranked: { url: string; impressions: number }[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const keys = record["keys"];
    const url = Array.isArray(keys) && typeof keys[0] === "string" ? keys[0] : null;
    if (!url) continue;
    const impressions = typeof record["impressions"] === "number" ? record["impressions"] : 0;
    ranked.push({ url, impressions });
  }
  return ranked
    .sort((a, b) => b.impressions - a.impressions)
    .map((row) => row.url)
    .filter((url, index, all) => all.indexOf(url) === index);
}

async function selectedProperty(client: Client, tenantId: string): Promise<string | null> {
  const { data, error } = await client
    .from("search_console_properties")
    .select("site_url, selected")
    .eq("tenant_id", tenantId)
    .order("site_url");
  if (error) throw new Error(error.message);
  const row = data?.find((entry) => entry.selected) ?? data?.[0] ?? null;
  return row?.site_url ?? null;
}

async function reportedPageUrls(
  client: Client,
  tenantId: string,
  property: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("search_console_snapshots")
    .select("dimensions, payload, period_end_pt")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .eq("kind", "dimensional_rows")
    .order("period_end_pt", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  const newest = (data ?? []).find((snapshot) => {
    const dimensions = snapshot.dimensions;
    return Array.isArray(dimensions) && dimensions.length === 1 && dimensions[0] === "page";
  });
  return newest ? payloadPageUrls(newest.payload) : [];
}

function toObservation(row: {
  url: string;
  final_url: string | null;
  title: string | null;
  h1: string | null;
  rendered_by: string | null;
  error: string | null;
  observed_at: string;
  details: unknown;
}): PageMetadataObservation {
  return {
    url: row.url,
    finalUrl: row.final_url,
    title: row.title,
    h1: row.h1,
    renderedBy: row.rendered_by,
    error: row.error,
    observedAt: row.observed_at,
    facts: factsFromDetails(row.details),
  };
}

/** Reads the stored audit without touching any external service. */
export async function readPageAudit(client: Client, tenantId: string): Promise<PageAuditView> {
  const property = await selectedProperty(client, tenantId);
  if (!property) {
    return {
      property: null,
      observedPages: 0,
      failedPages: 0,
      lastObservedAt: null,
      observations: [],
      duplicates: [],
      findings: [],
      instruction: "Select a Search Console property before auditing your pages.",
    };
  }

  const { data, error } = await client
    .from("page_metadata_observations")
    .select("url, final_url, title, h1, rendered_by, error, observed_at, details")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .order("observed_at", { ascending: false })
    .limit(600);
  if (error) throw new Error(error.message);

  const observations = selectLatestObservations((data ?? []).map(toObservation));
  const readable = observations.filter((observation) => observation.error === null);
  const duplicates = findDuplicateWording(readable);
  const analyzed = readable
    .filter((observation) => observation.facts)
    .map((observation) => ({ url: observation.url, facts: observation.facts as PageFacts }));
  const findings = groupFindings(evaluatePages(analyzed));

  return {
    property,
    observedPages: readable.length,
    failedPages: observations.length - readable.length,
    lastObservedAt: observations[0]?.observedAt ?? null,
    observations,
    duplicates,
    findings,
    instruction:
      analyzed.length > 0
        ? buildAuditHeadline({ observedPages: readable.length, findings })
        : buildAuditInstruction({
            observedPages: readable.length,
            failedPages: observations.length - readable.length,
            duplicates,
          }),
  };
}

/**
 * Reads the live wording of every page Google reported for the selected
 * property and stores one immutable observation per page. A page that cannot
 * be rendered is stored with its failure reason rather than skipped.
 */
export async function runPageAudit(
  client: Client,
  tenantId: string,
  actorId: string,
): Promise<PageAuditView> {
  const property = await selectedProperty(client, tenantId);
  if (!property) throw new Error("Select a Search Console property before auditing page wording.");

  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) {
    throw new Error("Pages cannot be read: FIRECRAWL_API_KEY is not configured.");
  }

  const urls = (await reportedPageUrls(client, tenantId, property)).slice(0, AUDIT_PAGE_LIMIT);
  if (urls.length === 0) {
    throw new Error(
      "No page rows are stored yet. Run the Search Console observation first, then audit page wording.",
    );
  }

  const observedAt = new Date().toISOString();
  const rows: Database["public"]["Tables"]["page_metadata_observations"]["Insert"][] = [];
  for (const url of urls) {
    try {
      const rendered = await scrapePage(url, key);
      const facts = extractPageFacts(rendered.html, rendered.markdown, rendered.finalUrl);
      rows.push({
        tenant_id: tenantId,
        property,
        url,
        final_url: rendered.finalUrl,
        title: facts.title,
        h1: facts.h1s[0] ?? null,
        rendered_by: "Firecrawl",
        details: facts as unknown as Database["public"]["Tables"]["page_metadata_observations"]["Insert"]["details"],
        error: null,
        observed_at: observedAt,
        requested_by: actorId,
      });
    } catch (error) {
      rows.push({
        tenant_id: tenantId,
        property,
        url,
        final_url: null,
        title: null,
        h1: null,
        rendered_by: null,
        error: error instanceof Error ? error.message : String(error),
        observed_at: observedAt,
        requested_by: actorId,
      });
    }
  }

  const { error } = await client.from("page_metadata_observations").insert(rows);
  if (error) throw new Error(error.message);

  return readPageAudit(client, tenantId);
}
