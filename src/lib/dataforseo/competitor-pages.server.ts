import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { firecrawlEndpoint, type FirecrawlEndpoint } from "../firecrawl-endpoint";
import { scrapePageWithVps } from "../connectors/vps-scraper.server";
import type { CompetitorProfile } from "./competitor-intelligence.server";

type Client = SupabaseClient<Database>;

/**
 * Page-level observation of shortlisted competitors. This layer records what a
 * winning page observably *is*: its type, structure, coverage, and markup. It
 * never copies competitor content, never stores full page text as reusable
 * copy, and never asserts why a page ranks. Recommendations are produced later,
 * by the reasoning layer, from these observations.
 */

export type PageObservation = {
  domain: string;
  keyword: string;
  url: string;
  position: number;
  fetched: boolean;
  pageType: string;
  intentMatch: "commercial_service" | "informational" | "listing" | "unclear";
  wordCount: number;
  headingCounts: { h1: number; h2: number; h3: number };
  headingSamples: string[];
  topicalCoverage: string[];
  schemaTypes: string[];
  internalLinks: number;
  externalLinks: number;
  hasPhoneCta: boolean;
  hasQuoteForm: boolean;
  hasReviewSignals: boolean;
  hasFaqBlock: boolean;
  observedAt: string;
};

export type CompetitorPageEvidence = {
  shortlist: string[];
  pagesInspected: number;
  pagesFailed: number;
  knowledgeEntriesCreated: number;
  repeatedTactics: { tactic: string; domains: string[] }[];
  firecrawlCalls: number;
};

/** Topic vocabulary observed on moving-industry service pages. */
const TOPIC_TERMS: { label: string; pattern: RegExp }[] = [
  { label: "long distance moving", pattern: /long[- ]distance/i },
  { label: "local moving", pattern: /\blocal mov/i },
  { label: "interstate / state-to-state", pattern: /interstate|state[- ]to[- ]state/i },
  { label: "packing services", pattern: /\bpacking\b/i },
  { label: "storage", pattern: /\bstorage\b/i },
  { label: "auto transport", pattern: /auto transport|car shipping/i },
  { label: "pricing / cost", pattern: /\bcost\b|\bpricing\b|\bquote\b|\bestimate\b/i },
  { label: "licensing / DOT", pattern: /\bUSDOT\b|\bDOT #|\bMC #|licensed and insured/i },
  { label: "reviews / testimonials", pattern: /\breviews?\b|testimonial/i },
  { label: "checklists / guides", pattern: /checklist|step[- ]by[- ]step|\bguide\b/i },
  { label: "insurance / valuation", pattern: /valuation|insurance coverage/i },
  { label: "commercial / office moving", pattern: /office mov|commercial mov/i },
];

type ScrapeResult = { markdown: string; html: string; title: string; renderedBy: string };

/**
 * Render one competitor page, on the self-hosted crawler wherever it can do it.
 *
 * This opened with `requireFirecrawl()`, which threw whenever no Firecrawl
 * deployment was configured -- so wherever Firecrawl is the unavailable
 * renderer, the whole competitor page pass died before reading a single page,
 * while Crawl4AI sat on the operator's own box answering health checks. The
 * page audit already renders Crawl4AI-first (`page-audit.server.ts`); this
 * caller never got the same treatment.
 *
 * Crawl4AI costs nothing per page and competitor pages are read in batches, so
 * it is the only sensible default here. Firecrawl stays as a fallback, and the
 * reason Crawl4AI was skipped or failed is carried out in `renderedBy` so a box
 * that has quietly stopped working cannot pass for a working one while the
 * metered account absorbs the cost.
 */
async function scrapePage(url: string): Promise<ScrapeResult | null> {
  const firecrawl = firecrawlEndpoint(process.env);
  const selfHosted = Boolean(
    process.env["VPS_SCRAPER_BASE_URL"]?.trim() && process.env["VPS_SCRAPER_API_KEY"]?.trim(),
  );

  if (selfHosted) {
    try {
      const rendered = await scrapePageWithVps(url);
      return {
        markdown: rendered.markdown,
        html: rendered.html,
        title: titleFromHtml(rendered.html) ?? url,
        renderedBy: "Crawl4AI",
      };
    } catch (error) {
      if (!firecrawl) return null;
      const reason = error instanceof Error ? error.message : String(error);
      const rendered = await scrapeWithFirecrawl(url, firecrawl);
      return rendered
        ? {
            ...rendered,
            renderedBy: `${firecrawlName(firecrawl)} after Crawl4AI failed: ${reason}`,
          }
        : null;
    }
  }

  if (!firecrawl) return null;
  const rendered = await scrapeWithFirecrawl(url, firecrawl);
  return rendered ? { ...rendered, renderedBy: firecrawlName(firecrawl) } : null;
}

function firecrawlName(endpoint: FirecrawlEndpoint): string {
  return endpoint.selfHosted ? "Firecrawl (self-hosted)" : "Firecrawl";
}

/** Crawl4AI returns no title field, so it is read off the rendered HTML. */
function titleFromHtml(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;
}

async function scrapeWithFirecrawl(
  url: string,
  endpoint: FirecrawlEndpoint,
): Promise<Omit<ScrapeResult, "renderedBy"> | null> {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown", "rawHtml"], onlyMainContent: false }),
  });

  const body = await response.text();
  if (!response.ok) {
    if (response.status === 402) {
      throw new Error("Firecrawl credits are exhausted for the connected account.");
    }
    return null;
  }

  const parsed = JSON.parse(body) as {
    markdown?: string;
    rawHtml?: string;
    metadata?: { title?: string };
    data?: { markdown?: string; rawHtml?: string; metadata?: { title?: string } };
  };
  const markdown = parsed.markdown ?? parsed.data?.markdown ?? "";
  const html = parsed.rawHtml ?? parsed.data?.rawHtml ?? "";
  if (!markdown && !html) return null;
  return { markdown, html, title: parsed.metadata?.title ?? parsed.data?.metadata?.title ?? url };
}

function schemaTypesFrom(html: string): string[] {
  const types = new Set<string>();
  const blocks = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    const raw = block[1] ?? "";
    for (const match of raw.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      const value = match[1];
      if (value) types.add(value);
    }
  }
  return [...types].sort();
}

function linkCounts(html: string, domain: string): { internal: number; external: number } {
  let internal = 0;
  let external = 0;
  for (const match of html.matchAll(/<a\s[^>]*href="([^"]+)"/gi)) {
    const href = match[1] ?? "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/")) internal += 1;
    else if (href.includes(domain)) internal += 1;
    else if (/^https?:\/\//i.test(href)) external += 1;
  }
  return { internal, external };
}

function classifyPageType(url: string, markdown: string, headings: string[]): string {
  const path = url.replace(/^https?:\/\/[^/]+/, "").toLowerCase();
  if (path === "" || path === "/") return "homepage";
  if (/\/(blog|guide|resources|article|news)\//.test(path)) return "editorial article";
  if (/\/(location|city|state|areas?-we-serve)/.test(path)) return "location landing page";
  if (/(cost|price|pricing|calculator|quote)/.test(path)) return "cost / quote page";
  if (/(service|moving|movers)/.test(path)) return "service landing page";
  if (headings.some((heading) => /^\d+\s/.test(heading)) && markdown.length > 6000)
    return "long-form list article";
  return "content page";
}

function classifyIntent(pageType: string, markdown: string): PageObservation["intentMatch"] {
  if (/get (a )?free (quote|estimate)|request a quote|call now/i.test(markdown)) {
    if (pageType.includes("article")) return "informational";
    return "commercial_service";
  }
  if (pageType.includes("article")) return "informational";
  if (pageType === "homepage" || pageType.includes("landing")) return "commercial_service";
  if (/best \d+|top \d+|compare/i.test(markdown)) return "listing";
  return "unclear";
}

function observe(
  domain: string,
  keyword: string,
  url: string,
  position: number,
  page: ScrapeResult,
): PageObservation {
  const markdown = page.markdown;
  const headingLines = markdown
    .split("\n")
    .filter((line) => /^#{1,3}\s/.test(line))
    .map((line) => line.replace(/^#+\s*/, "").trim());

  const headingCounts = {
    h1: markdown.split("\n").filter((line) => /^#\s/.test(line)).length,
    h2: markdown.split("\n").filter((line) => /^##\s/.test(line)).length,
    h3: markdown.split("\n").filter((line) => /^###\s/.test(line)).length,
  };

  const pageType = classifyPageType(url, markdown, headingLines);
  const links = linkCounts(page.html, domain);

  return {
    domain,
    keyword,
    url,
    position,
    fetched: true,
    pageType,
    intentMatch: classifyIntent(pageType, markdown),
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    headingCounts,
    headingSamples: headingLines.slice(0, 12),
    topicalCoverage: TOPIC_TERMS.filter((term) => term.pattern.test(markdown)).map(
      (term) => term.label,
    ),
    schemaTypes: schemaTypesFrom(page.html),
    internalLinks: links.internal,
    externalLinks: links.external,
    hasPhoneCta: /tel:\+?\d/.test(page.html),
    hasQuoteForm: /<form[\s>]/i.test(page.html) || /request a (free )?quote/i.test(markdown),
    hasReviewSignals: /\b\d\.\d\s*(out of 5|stars?)\b|google reviews|trustpilot/i.test(markdown),
    hasFaqBlock:
      /frequently asked questions/i.test(markdown) || /"@type"\s*:\s*"FAQPage"/i.test(page.html),
    observedAt: new Date().toISOString(),
  };
}

function repeatedTactics(observations: PageObservation[]): { tactic: string; domains: string[] }[] {
  const buckets = new Map<string, Set<string>>();
  const add = (tactic: string, domain: string) => {
    const set = buckets.get(tactic) ?? new Set<string>();
    set.add(domain);
    buckets.set(tactic, set);
  };

  for (const observation of observations) {
    if (observation.hasQuoteForm) add("Quote request form on the ranking page", observation.domain);
    if (observation.hasPhoneCta)
      add("Click-to-call phone CTA in the page markup", observation.domain);
    if (observation.hasFaqBlock) add("FAQ block on the ranking page", observation.domain);
    if (observation.hasReviewSignals)
      add("Review or rating proof on the ranking page", observation.domain);
    if (observation.schemaTypes.length > 0) {
      add(
        `Structured data present (${observation.schemaTypes.slice(0, 3).join(", ")})`,
        observation.domain,
      );
    }
    if (observation.wordCount >= 1200) add("Long-form page (1,200+ words)", observation.domain);
    if (observation.internalLinks >= 60)
      add("Dense internal linking (60+ internal links)", observation.domain);
    for (const topic of observation.topicalCoverage)
      add(`Covers topic: ${topic}`, observation.domain);
  }

  return (
    [...buckets.entries()]
      .map(([tactic, domains]) => ({ tactic, domains: [...domains] }))
      // A tactic is only "repeated" when more than one winner does it.
      .filter((entry) => entry.domains.length > 1)
      .sort((a, b) => b.domains.length - a.domains.length)
  );
}

/**
 * Inspects the best-ranking page of each shortlisted competitor and files the
 * observations as knowledge evidence. One page per domain keeps the pass cheap
 * and keeps the evidence attributable to a specific query.
 */
export async function inspectShortlistPages(
  client: Client,
  tenantId: string,
  profiles: CompetitorProfile[],
): Promise<CompetitorPageEvidence> {
  const shortlist = profiles.filter((profile) => profile.shortlisted);

  const { data: collection, error: collectionError } = await client
    .from("knowledge_collections")
    .select("id")
    .eq("key", "kb.research")
    .maybeSingle();
  if (collectionError) throw new Error(collectionError.message);
  if (!collection) throw new Error("Knowledge collection kb.research does not exist.");

  const observations: PageObservation[] = [];
  let pagesFailed = 0;
  let firecrawlCalls = 0;
  let knowledgeEntriesCreated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const profile of shortlist) {
    const target = profile.topUrls[0];
    if (!target || !target.url) {
      pagesFailed += 1;
      continue;
    }

    firecrawlCalls += 1;
    const page = await scrapePage(target.url);
    if (!page) {
      pagesFailed += 1;
      continue;
    }

    const observation = observe(profile.domain, target.keyword, target.url, target.position, page);
    observations.push(observation);

    const sourceRef = `competitor-page:${today}:${target.url}`;
    const { data: existing } = await client
      .from("knowledge_entries")
      .select("id")
      .eq("collection_id", collection.id)
      .eq("source_ref", sourceRef)
      .maybeSingle();

    if (!existing) {
      // Observations only. No competitor copy is stored, so nothing here can be
      // reused as content.
      const body = [
        `Observed page: ${target.url}`,
        `Ranking for approved keyword "${target.keyword}" at organic position ${target.position}.`,
        "",
        `Page type: ${observation.pageType}`,
        `Intent match: ${observation.intentMatch}`,
        `Approximate length: ${observation.wordCount} words`,
        `Heading structure: ${observation.headingCounts.h1} H1, ${observation.headingCounts.h2} H2, ${observation.headingCounts.h3} H3`,
        `Structured data: ${observation.schemaTypes.length > 0 ? observation.schemaTypes.join(", ") : "none detected"}`,
        `Internal links: ${observation.internalLinks} | External links: ${observation.externalLinks}`,
        `Conversion elements: ${
          [
            observation.hasQuoteForm ? "quote form" : null,
            observation.hasPhoneCta ? "click-to-call" : null,
            observation.hasReviewSignals ? "review proof" : null,
            observation.hasFaqBlock ? "FAQ block" : null,
          ]
            .filter(Boolean)
            .join(", ") || "none detected"
        }`,
        `Topical coverage: ${observation.topicalCoverage.join(", ") || "none matched"}`,
        "",
        "Section outline observed on the page (structure only):",
        ...observation.headingSamples.map((heading) => `- ${heading}`),
        "",
        "These are observations of a public page. They are not recommendations and make no claim about why the page ranks.",
      ].join("\n");

      const { error: insertError } = await client.from("knowledge_entries").insert({
        tenant_id: tenantId,
        collection_id: collection.id,
        title: `Competitor page observation: ${profile.domain} (${target.keyword})`,
        body,
        source_ref: sourceRef,
        tags: ["competitor-evidence", "observation", profile.domain],
        status: "active",
        metadata: {
          domain: profile.domain,
          keyword: target.keyword,
          url: target.url,
          position: target.position,
          observation,
          evidence_label: "observed",
        } as never,
      });
      if (insertError) throw new Error(insertError.message);
      knowledgeEntriesCreated += 1;
    }

    const { data: row } = await client
      .from("competitor_candidates")
      .select("id, metrics")
      .eq("tenant_id", tenantId)
      .eq("domain", profile.domain)
      .maybeSingle();
    if (row) {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const { error: updateError } = await client
        .from("competitor_candidates")
        .update({ metrics: { ...metrics, page_evidence: observation } as never })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
    }
  }

  const tactics = repeatedTactics(observations);

  if (tactics.length > 0) {
    const sourceRef = `competitor-tactics:${today}`;
    const { data: existing } = await client
      .from("knowledge_entries")
      .select("id")
      .eq("collection_id", collection.id)
      .eq("source_ref", sourceRef)
      .maybeSingle();
    if (!existing) {
      const { error: insertError } = await client.from("knowledge_entries").insert({
        tenant_id: tenantId,
        collection_id: collection.id,
        title: `Repeated tactics across shortlisted winners, ${today}`,
        body: [
          `Observed across ${observations.length} shortlisted competitor pages that rank for operator-approved keywords.`,
          "",
          ...tactics.map(
            (entry) =>
              `- ${entry.tactic}: ${entry.domains.length} of ${observations.length} winners (${entry.domains.join(", ")})`,
          ),
          "",
          "Repetition across winners is a pattern, not a cause. Nothing here claims these tactics produce the ranking.",
        ].join("\n"),
        source_ref: sourceRef,
        tags: ["competitor-evidence", "pattern", "observation"],
        status: "active",
        metadata: {
          tactics,
          observations: observations.length,
          evidence_label: "observed",
        } as never,
      });
      if (insertError) throw new Error(insertError.message);
      knowledgeEntriesCreated += 1;
    }
  }

  return {
    shortlist: shortlist.map((profile) => profile.domain),
    pagesInspected: observations.length,
    pagesFailed,
    knowledgeEntriesCreated,
    repeatedTactics: tactics,
    firecrawlCalls,
  };
}
