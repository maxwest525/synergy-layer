import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { fileInboxItem } from "../os.server";
import { phraseKey } from "../keyword-phrases";
import { rankByVolume } from "./keyword-ranking";
import { labsCall } from "./labs.server";

type Client = SupabaseClient<Database>;

/**
 * Keyword selection is operator-owned. Labs proposes, a human approves, and
 * only approved keywords ever reach the SERP queue. Nothing in this module is
 * allowed to invent a keyword: if there is no real seed and no real
 * suggestion, the pass fails loudly rather than guessing.
 */
export const KEYWORD_CONFIG = {
  locationCode: 2840, // United States
  languageCode: "en",
  /** Seeds taken from the property's own Search Console queries. */
  maxSeeds: 3,
  /** Provider-side row cap per call. */
  suggestionLimit: 100,
  /** Hard cap on how many candidates one pass may file for review. */
  maxCandidatesPerRun: 40,
};

type CandidateRow = {
  keyword: string;
  source: string;
  seed: string | null;
  snapshotId: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
};

function readKeywordInfo(item: Record<string, unknown>): {
  volume: number | null;
  cpc: number | null;
  competition: number | null;
} {
  const info = (item["keyword_info"] ?? {}) as Record<string, unknown>;
  const volume = info["search_volume"];
  const cpc = info["cpc"];
  const competition = info["competition"];
  return {
    volume: typeof volume === "number" ? volume : null,
    cpc: typeof cpc === "number" ? cpc : null,
    competition: typeof competition === "number" ? competition : null,
  };
}

/**
 * Operator-approved seed concepts, stored on the tenant. These outrank every
 * derived source because a human naming the service and the market is the
 * strongest evidence AOOS can have about what the business actually sells.
 */
export async function readTenantSeeds(client: Client, tenantId: string): Promise<string[]> {
  const { data } = await client.from("tenants").select("metadata").eq("id", tenantId).maybeSingle();
  const seeds = (data?.metadata as { keyword_seeds?: unknown } | null)?.keyword_seeds;
  if (!Array.isArray(seeds)) return [];
  return seeds.map((seed) => String(seed).trim().toLowerCase()).filter(Boolean);
}

/** Real Search Console queries are the only non-fabricated seed source. */
async function readSeedQueries(client: Client, tenantId: string): Promise<string[]> {
  const { data } = await client
    .from("search_console_snapshots")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "query")
    .order("period_end_pt", { ascending: false })
    .limit(3);

  const seen = new Set<string>();
  for (const snapshot of data ?? []) {
    const rows = (snapshot.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
    for (const row of rows) {
      const keys = row["keys"] as string[] | undefined;
      const keyword = String(keys?.[0] ?? row["query"] ?? "").trim();
      if (keyword) seen.add(keyword);
      if (seen.size >= KEYWORD_CONFIG.maxSeeds) break;
    }
    if (seen.size >= KEYWORD_CONFIG.maxSeeds) break;
  }
  return [...seen];
}

async function snapshotRows(
  client: Client,
  snapshotId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .single();
  return (data?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "your",
  "you",
  "our",
  "from",
  "that",
  "this",
  "are",
  "was",
  "will",
  "can",
  "get",
  "all",
  "any",
  "how",
  "why",
  "who",
  "what",
  "when",
  "into",
  "more",
  "best",
  "top",
  "near",
  "com",
  "www",
  "home",
  "page",
  "site",
  "welcome",
  "official",
]);

function phraseTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

/**
 * Seeds derived from the owned site itself. Reading the property's own title
 * and headings is real evidence about what the business sells, which is the
 * only defensible substitute when Search Console has no query history yet.
 */
async function readSeedsFromSite(domain: string): Promise<string[]> {
  const { scrapeFirecrawl } = await import("../web-research.server");
  const page = await scrapeFirecrawl(`https://${domain}`).catch(() => null);
  if (!page) return [];

  const headings = page.markdown
    .split("\n")
    .filter((line) => /^#{1,3}\s/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, ""))
    .slice(0, 12);

  const phrases = new Set<string>();
  for (const source of [page.title, ...headings]) {
    for (const segment of source.split(/[|\u2013\u2014\-:•,.!?]/)) {
      const cleaned = segment
        .replace(/[^A-Za-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const words = cleaned.split(" ").filter(Boolean);
      if (words.length < 2 || words.length > 5) continue;
      if (phraseTokens(cleaned).length === 0) continue;
      phrases.add(cleaned);
    }
  }
  return [...phrases];
}

/**
 * Proposes a keyword set for the owned domain and files it for approval.
 * Every candidate must be relevant to real evidence about the business: its
 * own Search Console queries, or the language on its own site. Provider
 * associations that match neither are discarded, because a domain with a thin
 * footprint makes the provider's own keyword list meaningless.
 */
export async function suggestKeywords(
  client: Client,
  tenantId: string,
  domain: string,
  workflow?: { runId?: string | null; key?: string | null },
  manualSeeds?: string[],
): Promise<{
  proposed: number;
  filed: number;
  alreadyKnown: number;
  /** Candidates the per-run cap left for a later run. */
  beyondCap: number;
  /** Candidates the provider returned with no volume figure; filed, never read as zero. */
  withoutVolume: number;
  /** Suggestions dropped as irrelevant to the seeds, the one filter this pass keeps. */
  discardedIrrelevant: number;
  seeds: string[];
  costUsd: number;
}> {
  const candidates = new Map<string, CandidateRow>();
  let costUsd = 0;

  // Seeds first: without real evidence of what the business sells, provider
  // associations cannot be judged and must not be filed. Operator-supplied
  // seeds outrank everything else, because a human naming the service and the
  // market is better evidence than headline copy.
  const explicitSeeds = (manualSeeds ?? [])
    .map((seed) => seed.trim().toLowerCase())
    .filter(Boolean);
  const operatorSeeds =
    explicitSeeds.length > 0 ? explicitSeeds : await readTenantSeeds(client, tenantId);
  const querySeeds = operatorSeeds.length > 0 ? [] : await readSeedQueries(client, tenantId);
  const siteSeeds =
    operatorSeeds.length > 0 || querySeeds.length > 0 ? [] : await readSeedsFromSite(domain);
  const seeds = [...operatorSeeds, ...querySeeds, ...siteSeeds];

  if (seeds.length === 0) {
    throw new Error(
      "No real seed evidence for this domain: Search Console has no stored queries and the site could not be read. Approve at least one seed keyword manually before keyword discovery can run: AOOS will not invent one.",
    );
  }

  const relevantTokens = new Set(seeds.flatMap(phraseTokens));
  const isRelevant = (keyword: string): boolean =>
    phraseTokens(keyword).some((token) => relevantTokens.has(token));

  const forSite = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/keywords_for_site/live",
    "labs_keywords_for_site",
    domain,
    {
      target: domain,
      location_code: KEYWORD_CONFIG.locationCode,
      language_code: KEYWORD_CONFIG.languageCode,
      limit: KEYWORD_CONFIG.suggestionLimit,
      include_serp_info: false,
    },
    workflow,
  );
  costUsd += forSite.costUsd;

  let discardedIrrelevant = 0;
  for (const item of await snapshotRows(client, forSite.snapshotId)) {
    const keyword = String(item["keyword"] ?? "")
      .trim()
      .toLowerCase();
    if (!keyword) continue;
    if (!isRelevant(keyword)) {
      discardedIrrelevant += 1;
      continue;
    }
    const info = readKeywordInfo(item);
    candidates.set(keyword, {
      keyword,
      source: "labs.keywords_for_site",
      seed: null,
      snapshotId: forSite.snapshotId,
      searchVolume: info.volume,
      cpc: info.cpc,
      competition: info.competition,
    });
  }

  for (const seed of seeds.slice(0, KEYWORD_CONFIG.maxSeeds)) {
    const suggestion = await labsCall(
      client,
      tenantId,
      "/dataforseo_labs/google/keyword_suggestions/live",
      "labs_keyword_suggestions",
      seed,
      {
        keyword: seed,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        limit: KEYWORD_CONFIG.suggestionLimit,
        include_serp_info: false,
      },
      workflow,
    );
    costUsd += suggestion.costUsd;

    for (const item of await snapshotRows(client, suggestion.snapshotId)) {
      const keyword = String(item["keyword"] ?? "")
        .trim()
        .toLowerCase();
      if (!keyword || candidates.has(keyword)) continue;
      if (!isRelevant(keyword)) {
        discardedIrrelevant += 1;
        continue;
      }
      const info = readKeywordInfo(item);
      candidates.set(keyword, {
        keyword,
        source: "labs.keyword_suggestions",
        seed,
        snapshotId: suggestion.snapshotId,
        searchVolume: info.volume,
        cpc: info.cpc,
        competition: info.competition,
      });
    }
  }

  // Nothing is filtered on volume: the operator sees the figure on the
  // candidate and decides (CONTENT-1). The cap is one run's filing.
  const ranking = rankByVolume([...candidates.values()], KEYWORD_CONFIG.maxCandidatesPerRun);
  const ranked = ranking.filed;

  if (ranked.length === 0) {
    throw new Error(
      "DataForSEO returned no relevant keyword suggestions for this domain. Approve at least one seed keyword manually before SERP observation can run: AOOS will not invent one.",
    );
  }

  const { data: tracked } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId);
  const known = new Set((tracked ?? []).map((row) => row.keyword.toLowerCase()));

  let filed = 0;
  let alreadyKnown = 0;
  for (const entry of ranked) {
    if (known.has(entry.keyword)) {
      alreadyKnown += 1;
      continue;
    }
    const { error } = await client.from("keyword_candidates").upsert(
      {
        tenant_id: tenantId,
        keyword: entry.keyword,
        source: entry.source,
        seed: entry.seed,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        snapshot_id: entry.snapshotId,
        metrics: {
          search_volume: entry.searchVolume,
          cpc: entry.cpc,
          competition: entry.competition,
          estimated: true,
        } as never,
      },
      {
        onConflict: "tenant_id,keyword,location_code,language_code",
        ignoreDuplicates: true,
      },
    );
    if (!error) filed += 1;
  }

  if (filed > 0) {
    const { data: openItems } = await client
      .from("inbox_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_module", "dataforseo")
      .is("resolved_at", null)
      .ilike("title", "%keyword candidates%");
    const pendingCount = await client
      .from("keyword_candidates")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("review_state", "pending");
    const remaining = pendingCount.count ?? filed;
    const update = {
      lane: "pending_approval" as const,
      title: `${remaining} keyword candidates need approval`,
      summary: `${remaining} keyword candidates are awaiting an operator decision. SERP observation runs only on approved keywords.`,
      actions: [{ kind: "open", href: "/keywords" }] as never,
    };
    const ids = (openItems ?? []).map((item) => item.id);
    if (ids.length > 0) {
      await client.from("inbox_items").update(update).in("id", ids);
    } else {
      await fileInboxItem(client, {
        tenantId,
        lane: update.lane,
        sourceModule: "dataforseo",
        title: update.title,
        summary: update.summary,
        priority: 2,
        actions: update.actions,
      });
    }
  }

  return {
    proposed: ranked.length,
    filed,
    alreadyKnown,
    beyondCap: ranking.beyondCap,
    withoutVolume: ranking.withoutVolume,
    discardedIrrelevant,
    seeds,
    costUsd,
  };
}

/**
 * The approved keywords a new approval would duplicate (CODE-98).
 *
 * Nothing deduped at intake, so fifty approved rows were fourteen targets:
 * nineteen spellings of "long distance movers", thirteen of "long distance
 * moving company". `getTrackedKeywords` is the entire input to SERP
 * observation, and serp.server.ts posts one paid task per string, so those
 * thirty-six redundant rows bought thirty-six answers to questions already
 * asked. The operator's standing rule is that OpenSEO and other non-metered
 * providers come first, and an OpenSEO rank tracker makes this worse rather
 * than better: adding keywords to a scheduled tracker arms recurring paid
 * checks, so thirty-six duplicates become thirty-six recurring ones.
 *
 * `phraseKey` already collapses spellings to their content words and is
 * tested; the detectors have used it since CODE-93. This is the same key
 * applied one stage earlier, at the door instead of in the reading.
 *
 * Returns the incoming keywords that a currently active approved keyword
 * already covers, keyed by the spelling that would be redundant. The first
 * spelling of a target to arrive keeps the slot; nothing already approved is
 * displaced by a newcomer.
 */
export function redundantAgainst(
  incoming: readonly string[],
  activeApproved: readonly string[],
): Map<string, string> {
  const held = new Map<string, string>();
  for (const approved of activeApproved) {
    const key = phraseKey(approved);
    if (key && !held.has(key)) held.set(key, approved);
  }

  const redundant = new Map<string, string>();
  for (const raw of incoming) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword) continue;
    const key = phraseKey(keyword);
    // A phrase with no content words is its own target: "best" alone groups
    // with nothing, and dropping it would be the tool deciding for the
    // operator rather than deduplicating.
    if (!key) continue;
    const covering = held.get(key);
    if (covering !== undefined && covering !== keyword) {
      redundant.set(keyword, covering);
      continue;
    }
    if (covering === undefined) held.set(key, keyword);
  }
  return redundant;
}

/**
 * Whether a candidate's stored metrics are worth snapshotting onto the approved
 * row (CODE-95).
 *
 * `keyword_candidates.metrics` defaults to `{}`, so an empty object is the
 * ordinary state of a candidate nobody has paid to enrich. Dating that as a
 * snapshot would say a reading was taken when none was, which is the same
 * mistake as rendering a placeholder zero as a measurement (CODE-72). Only an
 * object with something in it is a reading; everything else leaves all three
 * columns NULL, and NULL reads as the absence it is.
 */
export function metricsWorthKeeping(metrics: unknown): boolean {
  if (metrics === null || metrics === undefined) return false;
  if (typeof metrics !== "object" || Array.isArray(metrics)) return false;
  return Object.keys(metrics as Record<string, unknown>).length > 0;
}

/** Promotes reviewed candidates into the approved set that SERP observes. */
export async function approveKeywords(
  client: Client,
  tenantId: string,
  keywords: string[],
  approvedBy?: string | null,
): Promise<{ approved: number; metricsStored: number; metricsNotStored: number; folded: number }> {
  const now = new Date().toISOString();
  let approved = 0;
  let metricsStored = 0;
  let metricsNotStored = 0;
  let folded = 0;

  // What is already approved and active decides what a new approval would
  // duplicate. Read once (CODE-98).
  const { data: activeRows } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  const redundant = redundantAgainst(
    keywords,
    (activeRows ?? []).map((row) => row.keyword),
  );

  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword) continue;

    // A spelling of a target something already approved covers. The operator
    // did press approve, so the candidate leaves the queue as approved and does
    // not come back. It simply never becomes a tracked target of its own, which
    // is what a paid SERP task is bought per (CODE-98).
    if (redundant.has(keyword)) {
      const { data: dupe } = await client
        .from("keyword_candidates")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("keyword", keyword)
        .maybeSingle();
      if (dupe) {
        await client
          .from("keyword_candidates")
          .update({ review_state: "approved", reviewed_by: approvedBy ?? null, reviewed_at: now })
          .eq("id", dupe.id);
      }
      folded += 1;
      continue;
    }

    // `metrics` comes with the id now. Approval used to select the id alone and
    // drop everything else the candidate carried -- volume, CPC, competition,
    // difficulty, intent -- some of it paid for twice, and unrecoverable
    // afterwards because enrichment only ever sees pending rows (CODE-95).
    const { data: candidate } = await client
      .from("keyword_candidates")
      .select("id, metrics")
      .eq("tenant_id", tenantId)
      .eq("keyword", keyword)
      .maybeSingle();

    const metrics = candidate?.metrics;

    // The approval write is exactly what it always was. The metrics snapshot is
    // a second, separate write, because 20260903020000 may not be applied on
    // the host yet: folding the new columns into this upsert would make every
    // approval fail with "column does not exist", and `if (error) continue`
    // below would swallow it into "0 keywords approved" with no reason. A
    // migration that has not landed must not be able to break approval.
    const { error } = await client.from("tracked_keywords").upsert(
      {
        tenant_id: tenantId,
        keyword,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        candidate_id: candidate?.id ?? null,
        approved_by: approvedBy ?? null,
        active: true,
      },
      {
        onConflict: "tenant_id,keyword,location_code,language_code",
        ignoreDuplicates: true,
      },
    );
    if (error) continue;
    approved += 1;

    // Snapshot what the candidate was carrying, at the moment of approval
    // (CODE-95). Best effort by construction: an unapplied migration leaves the
    // keyword approved and the snapshot absent, which is the truth, rather than
    // failing the approval. The miss is counted so the caller can say so
    // instead of implying every approval was captured.
    if (metricsWorthKeeping(metrics)) {
      const { error: snapshotError } = await client
        .from("tracked_keywords")
        .update({
          approved_metrics: metrics as Json,
          approved_metrics_captured_at: now,
          approved_metrics_candidate_id: candidate?.id ?? null,
        })
        .eq("tenant_id", tenantId)
        .eq("keyword", keyword)
        .eq("location_code", KEYWORD_CONFIG.locationCode)
        .eq("language_code", KEYWORD_CONFIG.languageCode)
        .is("approved_metrics", null);
      if (snapshotError) metricsNotStored += 1;
      else metricsStored += 1;
    }

    if (candidate) {
      await client
        .from("keyword_candidates")
        .update({ review_state: "approved", reviewed_by: approvedBy ?? null, reviewed_at: now })
        .eq("id", candidate.id);
    }
  }

  return { approved, metricsStored, metricsNotStored, folded };
}

/** Marks candidates as rejected so a later pass does not re-file them. */
export async function rejectKeywords(
  client: Client,
  tenantId: string,
  keywords: string[],
  reviewedBy?: string | null,
): Promise<{ rejected: number }> {
  const normalised = keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  if (normalised.length === 0) return { rejected: 0 };

  const { data, error } = await client
    .from("keyword_candidates")
    .update({
      review_state: "rejected",
      reviewed_by: reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .in("keyword", normalised)
    .select("id");

  if (error) throw new Error(error.message);
  return { rejected: (data ?? []).length };
}

/** The approved keyword set. SERP observation reads this and nothing else. */
export async function getTrackedKeywords(client: Client, tenantId: string): Promise<string[]> {
  const { data, error } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("keyword");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.keyword);
}

/**
 * Keeps the approval Inbox item honest after an operator decision: it stays
 * open while candidates remain pending, and resolves once the queue is clear.
 */
export async function reconcileKeywordInbox(
  client: Client,
  tenantId: string,
): Promise<{ pending: number; inboxResolved: boolean }> {
  const { data: pending } = await client
    .from("keyword_candidates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("review_state", "pending");
  const remaining = (pending ?? []).length;

  const { data: items } = await client
    .from("inbox_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_module", "dataforseo")
    .is("resolved_at", null)
    .ilike("title", "%keyword candidates%");

  const ids = (items ?? []).map((row) => row.id);
  if (ids.length === 0) return { pending: remaining, inboxResolved: false };

  if (remaining === 0) {
    await client
      .from("inbox_items")
      .update({ lane: "completed", resolved_at: new Date().toISOString() })
      .in("id", ids);
    return { pending: 0, inboxResolved: true };
  }

  await client
    .from("inbox_items")
    .update({
      title: `${remaining} keyword candidates need approval`,
      summary: `${remaining} keyword candidates are still awaiting an operator decision. SERP observation runs only on approved keywords.`,
    })
    .in("id", ids);

  return { pending: remaining, inboxResolved: false };
}
