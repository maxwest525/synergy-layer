import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  extractPageFacts,
  evaluatePages,
  groupFindings,
  buildAuditHeadline,
  unreachablePagesBailReason,
  type PageFacts,
} from "./page-checks";
import {
  buildAuditInstruction,
  findDuplicateWording,
  rateLimitDelayMs,
  selectLatestObservations,
  type PageAuditView,
  type PageMetadataObservation,
} from "./page-audit";
import {
  buildSiteHeadline,
  declaredSitemapsFrom,
  evaluateSite,
  isSitemapIndex,
  pagesMissingFromSitemap,
  sitemapLocations,
  type SiteFacts,
} from "./site-checks";
import { scrapePageWithVps, vpsScraperConfigured } from "./connectors/vps-scraper.server";
import { firecrawlEndpoint, type FirecrawlEndpoint } from "./firecrawl-endpoint";
import { isRobotsPathAllowed } from "./robots-rules";

/**
 * How many times a rate-limited page is asked for again before it is recorded
 * as unread.
 *
 * The audit renders every known page in one sequential pass, which is bursty
 * enough to trip Firecrawl's rate limit part way through. A 429 is not a fact
 * about the page — nothing was served — but the run stored it as the page's
 * observation anyway, and `readPageAudit` drops errored observations, so a
 * rate-limited page silently left the audit until the next run. On 2026-08-22
 * that removed 18 of 30 pages, every service page among them, which starved the
 * one fix lane that can complete.
 *
 * Retrying costs nothing extra: a 429 is not billed, and a page that succeeds
 * on the second ask is a page the run was always going to pay to render.
 */
const RATE_LIMIT_RETRIES = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Which renderer read a page, recorded on the observation so the operator can
 * tell a free read from a billed one without inspecting an invoice.
 */
function firecrawlName(endpoint: FirecrawlEndpoint): string {
  return endpoint.selfHosted ? "Firecrawl (self-hosted)" : "Firecrawl";
}

/**
 * Render one page, on the self-hosted crawler wherever it can do the job.
 *
 * Crawl4AI runs on Max's own box, so a page it renders costs nothing. Firecrawl
 * is metered per page, and until now every one of the site's pages went through
 * it on every audit — while `scrapeWithVps` sat in the tree with no caller and
 * `surface-inventory.ts` recorded the gap in writing.
 *
 * The fallback is deliberately narrow and deliberately loud. It is taken only
 * when the self-hosted crawler is not configured, or when it fails on a page,
 * and the reason it failed is carried into the stored observation so a box that
 * has quietly stopped working cannot masquerade as a working one while the
 * metered account absorbs the cost again.
 */
async function renderPage(
  url: string,
  firecrawl: FirecrawlEndpoint | null,
  selfHosted: boolean,
): Promise<{ html: string; markdown: string; finalUrl: string; renderedBy: string }> {
  if (selfHosted) {
    try {
      const rendered = await scrapePageWithVps(url);
      return { ...rendered, renderedBy: "Crawl4AI" };
    } catch (error) {
      if (!firecrawl) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      const rendered = await scrapePage(url, firecrawl);
      return {
        ...rendered,
        renderedBy: `${firecrawlName(firecrawl)} (self-hosted crawler failed: ${reason})`,
      };
    }
  }
  if (!firecrawl) throw new Error("No renderer is configured.");
  const rendered = await scrapePage(url, firecrawl);
  return { ...rendered, renderedBy: firecrawlName(firecrawl) };
}

/** Renders one live page and returns its raw HTML and text. Throws with the real reason. */
async function scrapePage(
  url: string,
  endpoint: FirecrawlEndpoint,
): Promise<{ html: string; markdown: string; finalUrl: string }> {
  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(endpoint.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${endpoint.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["rawHtml", "markdown"],
        onlyMainContent: false,
        waitFor: 3000,
        maxAge: 0,
      }),
    });
    if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break;
    await sleep(rateLimitDelayMs(response.headers.get("retry-after"), attempt));
  }
  const text = await response.text();
  if (response.status === 429) {
    throw new Error(
      `Firecrawl rate limited this page ${RATE_LIMIT_RETRIES + 1} times, so nothing was read.`,
    );
  }
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
export const AUDIT_PAGE_LIMIT = 100;

/** The public origin of a Search Console property, or null when it has none. */
export function originForProperty(property: string): string | null {
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length).trim();
    return domain ? `https://${domain}` : null;
  }
  try {
    return new URL(property).origin;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<{ status: number | null; body: string | null }> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    const body = await response.text();
    return { status: response.status, body: response.ok ? body : null };
  } catch {
    return { status: null, body: null };
  }
}

/**
 * Reads the crawl directives of the whole site: robots.txt, every sitemap it
 * declares, and the well known sitemap address. One level of sitemap index is
 * followed so a split sitemap still yields its page list.
 */
export async function readSiteDocuments(origin: string): Promise<{
  robotsStatus: number | null;
  robotsBody: string | null;
  declaredSitemaps: string[];
  sitemapUrl: string | null;
  sitemapStatus: number | null;
  sitemapUrls: string[];
}> {
  const robots = await fetchText(`${origin}/robots.txt`);
  const declaredSitemaps = robots.body ? declaredSitemapsFrom(robots.body) : [];
  const candidates = [...new Set([...declaredSitemaps, `${origin}/sitemap.xml`])];

  for (const candidate of candidates) {
    const document = await fetchText(candidate);
    if (document.body === null) {
      if (candidate === candidates.at(-1)) {
        return {
          robotsStatus: robots.status,
          robotsBody: robots.body,
          declaredSitemaps,
          sitemapUrl: candidate,
          sitemapStatus: document.status,
          sitemapUrls: [],
        };
      }
      continue;
    }
    let urls = sitemapLocations(document.body);
    if (isSitemapIndex(document.body)) {
      const children: string[] = [];
      for (const child of urls.slice(0, 10)) {
        const childDocument = await fetchText(child);
        if (childDocument.body) children.push(...sitemapLocations(childDocument.body));
      }
      urls = [...new Set(children)];
    }
    return {
      robotsStatus: robots.status,
      robotsBody: robots.body,
      declaredSitemaps,
      sitemapUrl: candidate,
      sitemapStatus: document.status,
      sitemapUrls: urls,
    };
  }

  return {
    robotsStatus: robots.status,
    robotsBody: robots.body,
    declaredSitemaps,
    sitemapUrl: null,
    sitemapStatus: null,
    sitemapUrls: [],
  };
}

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

function siteFactsFrom(value: unknown): SiteFacts | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record["origin"] === "string" ? (value as SiteFacts) : null;
}

async function latestSiteFacts(
  client: Client,
  tenantId: string,
  property: string,
): Promise<{ facts: SiteFacts | null; observedAt: string | null }> {
  const { data, error } = await client
    .from("site_audit_snapshots")
    .select("facts, observed_at")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .order("observed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { facts: row ? siteFactsFrom(row.facts) : null, observedAt: row?.observed_at ?? null };
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
      orphanBailReason: null,
      siteFindings: [],
      siteInstruction: "Select a Search Console property before running the technical site checks.",
      siteObservedAt: null,
      instruction: "Select a Search Console property before auditing your pages.",
    };
  }

  const { data, error } = await client
    .from("page_metadata_observations")
    .select("url, final_url, title, h1, rendered_by, error, observed_at, details")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .order("observed_at", { ascending: false })
    .limit(1200);
  if (error) throw new Error(error.message);

  const observations = selectLatestObservations((data ?? []).map(toObservation));
  const readable = observations.filter((observation) => observation.error === null);
  const duplicates = findDuplicateWording(readable);
  const analyzed = readable
    .filter((observation) => observation.facts)
    .map((observation) => ({
      url: observation.url,
      facts: observation.facts as PageFacts,
      finalUrl: observation.finalUrl,
    }));
  const findings = groupFindings(evaluatePages(analyzed));
  // Null when nothing has been read at all: that state is already named by
  // "the page audit has never run", so this note stays for the case where the
  // audit ran but the orphan check specifically could not.
  const orphanBailReason = analyzed.length > 0 ? unreachablePagesBailReason(analyzed) : null;

  const site = await latestSiteFacts(client, tenantId, property);
  const siteFindings = site.facts ? evaluateSite(site.facts) : [];

  return {
    property,
    observedPages: readable.length,
    failedPages: observations.length - readable.length,
    lastObservedAt: observations[0]?.observedAt ?? null,
    observations,
    duplicates,
    findings,
    orphanBailReason,
    siteFindings,
    siteInstruction: site.facts
      ? buildSiteHeadline(siteFindings, readable.length)
      : "No technical site checks have run yet. Run the audit to read robots.txt, the sitemap and every page.",
    siteObservedAt: site.observedAt,
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
 * Whether the audit may spend a Firecrawl call on this address.
 *
 * A robots.txt that could not be read is not a licence to skip: an unreadable
 * file means unknown, and the audit reads the page rather than inventing a
 * block that robots.txt never stated.
 */
function crawlablePath(url: string, robotsBody: string | null, origin: string): boolean {
  if (robotsBody === null) return true;
  try {
    const parsed = new URL(url);
    // A `sc-domain:` property spans every subdomain, and Search Console reports
    // pages from all of them. Only this origin's robots.txt was fetched, so a
    // page on another host is read rather than skipped on a rule that was never
    // written for it.
    if (parsed.origin !== origin) return true;
    return isRobotsPathAllowed(robotsBody, `${parsed.pathname}${parsed.search}`);
  } catch {
    return true;
  }
}

/**
 * Reads the whole site: robots.txt, the sitemap, and the live wording of every
 * page discovered from the sitemap and from what Google reported. One immutable
 * observation is stored per page, and one per site wide read. A page that
 * cannot be rendered is stored with its failure reason rather than skipped.
 */
export async function runPageAudit(
  client: Client,
  tenantId: string,
  actorId: string,
): Promise<PageAuditView> {
  const property = await selectedProperty(client, tenantId);
  if (!property) throw new Error("Select a Search Console property before auditing page wording.");

  // The self-hosted crawler is preferred and the metered one is the fallback,
  // never the other way round. Either alone is enough to run the audit.
  const selfHosted = vpsScraperConfigured(process.env);
  const firecrawl = firecrawlEndpoint(process.env);
  if (!firecrawl && !selfHosted) {
    throw new Error(
      "Pages cannot be read: configure VPS_SCRAPER_BASE_URL and VPS_SCRAPER_API_KEY for the self-hosted crawler, or FIRECRAWL_API_KEY for the metered one.",
    );
  }

  const origin = originForProperty(property);
  if (!origin) {
    throw new Error(`The selected property ${property} has no readable public address.`);
  }

  const documents = await readSiteDocuments(origin);
  const reported = await reportedPageUrls(client, tenantId, property);
  const sitemapPages = documents.sitemapUrls.filter((url) => url.startsWith(origin));

  // Pages Google reported come first: they already carry search evidence. The
  // sitemap then fills in everything Google has not reported yet.
  const urls = [...new Set([...reported, ...sitemapPages])].slice(0, AUDIT_PAGE_LIMIT);
  if (urls.length === 0) {
    throw new Error(
      "No pages could be discovered. Publish a sitemap or run the Search Console observation first, then audit the site.",
    );
  }

  const observedAt = new Date().toISOString();
  const rows: Database["public"]["Tables"]["page_metadata_observations"]["Insert"][] = [];
  const unreadablePages: string[] = [];
  for (const url of urls) {
    // Firecrawl is metered. A page robots.txt disallows is one Google will
    // never read, so paying to render it buys nothing. It is still recorded,
    // with the reason, so the page does not quietly vanish from the audit.
    if (!crawlablePath(url, documents.robotsBody, origin)) {
      rows.push({
        tenant_id: tenantId,
        property,
        url,
        final_url: null,
        title: null,
        h1: null,
        rendered_by: null,
        error: "Not read: robots.txt disallows crawlers from this page.",
        observed_at: observedAt,
        requested_by: actorId,
      });
      continue;
    }
    try {
      const rendered = await renderPage(url, firecrawl, selfHosted);
      const facts = extractPageFacts(rendered.html, rendered.markdown, rendered.finalUrl);
      rows.push({
        tenant_id: tenantId,
        property,
        url,
        final_url: rendered.finalUrl,
        title: facts.title,
        h1: facts.h1s[0] ?? null,
        rendered_by: rendered.renderedBy,
        details: JSON.parse(
          JSON.stringify(facts),
        ) as Database["public"]["Tables"]["page_metadata_observations"]["Row"]["details"],
        error: null,
        observed_at: observedAt,
        requested_by: actorId,
      });
    } catch (error) {
      unreadablePages.push(url);
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

  const siteFacts: SiteFacts = {
    origin,
    robotsStatus: documents.robotsStatus,
    robotsBody: documents.robotsBody,
    declaredSitemaps: documents.declaredSitemaps,
    sitemapUrl: documents.sitemapUrl,
    sitemapStatus: documents.sitemapStatus,
    sitemapUrlCount: documents.sitemapUrl ? documents.sitemapUrls.length : null,
    pagesMissingFromSitemap: pagesMissingFromSitemap({
      reportedUrls: reported,
      sitemapUrls: documents.sitemapUrls,
    }),
    unreadablePages,
    knownPages: urls,
    // What the site itself says it wants indexed. A page disallowed by
    // robots.txt and declared nowhere is a working configuration; one that is
    // disallowed *and* declared is the two files contradicting each other.
    declaredPages: [...new Set([...sitemapPages, ...reported])],
  };

  const { error: siteError } = await client.from("site_audit_snapshots").insert({
    tenant_id: tenantId,
    property,
    origin,
    facts: JSON.parse(
      JSON.stringify(siteFacts),
    ) as Database["public"]["Tables"]["site_audit_snapshots"]["Insert"]["facts"],
    observed_at: observedAt,
    requested_by: actorId,
  });
  if (siteError) throw new Error(siteError.message);

  return readPageAudit(client, tenantId);
}
