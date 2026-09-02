import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import { originForProperty, readSiteDocuments } from "./page-audit.server";
import { checksum } from "./search-console.server";
import {
  compareNights,
  watchFactsFromHtml,
  type NightlyPageRead,
  type SiteWatchObservationDraft,
} from "./site-watch-rule-checks";

/**
 * The nightly live-site read (CODE-87, IDEA-22).
 *
 * The page audit renders pages on an operator's click and Search Console
 * reports what Google saw days ago; between clicks nothing read the site
 * itself, so a page that started answering 404, went noindex or changed its
 * canonical was found at the next audit rather than the next morning. This
 * reads every sitemap address directly, free, stores one row per address per
 * UTC date, and compares each address with its most recent earlier read.
 */

type Admin = SupabaseClient<Database>;

/**
 * Stated assumption: a bound on one night's work, twice the audit's page
 * limit. The sitemap is read in its own order and any remainder is reported
 * in the run's result, never dropped silently.
 */
export const SITE_WATCH_PAGE_LIMIT = 200;
const READ_TIMEOUT_MS = 10_000;
const CONCURRENT_READS = 4;

export type SiteWatchRunResult = {
  property: string;
  origin: string;
  observedOn: string;
  pagesListed: number;
  pagesRead: number;
  pagesUnanswered: number;
  pagesBeyondLimit: number;
  comparedWith: string | null;
  findingsFiled: number;
};

type FetchedPage = Omit<NightlyPageRead, "url" | "observedOn"> & {
  robots: string | null;
  title: string | null;
};

async function fetchForWatch(url: string): Promise<FetchedPage> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      headers: { "user-agent": "AOOS site watch" },
    });
    const xRobotsTag = response.headers.get("x-robots-tag");
    const isHtml = /html/i.test(response.headers.get("content-type") ?? "");
    if (!response.ok) {
      return {
        status: response.status,
        finalUrl: response.url || null,
        noindex: null,
        robots: null,
        canonical: null,
        title: null,
        error: null,
      };
    }
    const facts = isHtml
      ? watchFactsFromHtml(await response.text(), xRobotsTag)
      : {
          noindex: /\bnoindex\b/i.test(xRobotsTag ?? ""),
          robots: null,
          canonical: null,
          title: null,
        };
    return { status: response.status, finalUrl: response.url || null, ...facts, error: null };
  } catch (error) {
    return {
      status: null,
      finalUrl: null,
      noindex: null,
      robots: null,
      canonical: null,
      title: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readAll(urls: readonly string[]): Promise<Map<string, FetchedPage>> {
  const results = new Map<string, FetchedPage>();
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      results.set(url, await fetchForWatch(url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_READS, urls.length) }, worker));
  return results;
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function fileDrafts(
  admin: Admin,
  tenantId: string,
  drafts: readonly SiteWatchObservationDraft[],
): Promise<number> {
  let created = 0;
  for (const draft of drafts) {
    // Module name in the checksum, tenant scoped on the lookup, as the other
    // rule writers do (umami-rules.server.ts).
    const issueFingerprint = checksum(["site-watch", draft.rule, draft.target]);
    const { data: open, error: openError } = await admin
      .from("recommendations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new Error(openError.message);
    if (open?.id) continue;
    const { error } = await admin.from("recommendations").insert(
      observationRecommendationRecord({
        tenant_id: tenantId,
        title: draft.title,
        description: draft.description,
        source_module: "site-watch",
        business_impact: draft.businessImpact,
        time_saved_minutes: 0,
        risk: "none",
        // Two direct reads by the same reader, nothing inferred between them.
        confidence: 1,
        reasoning: `Rule ${draft.rule} over two stored site_watch_reads rows for ${draft.target}.`,
        suggested_action: { kind: "review", rule: draft.rule, target: draft.target } as never,
        issue_fingerprint: issueFingerprint,
        metadata: { rule: draft.rule, evidence: draft.evidence } as never,
      }),
    );
    if (error) throw new Error(error.message);
    created += 1;
  }
  return created;
}

/**
 * Read every sitemap address of the property's site, store tonight's rows,
 * compare them with the most recent earlier night, and file what changed.
 * Opens and closes one measurement run so the cadence page can show it.
 */
export async function readLiveSite(
  admin: Admin,
  input: { tenantId: string; property: string; actorId: string | null; now?: Date },
): Promise<SiteWatchRunResult> {
  const now = input.now ?? new Date();
  const origin = originForProperty(input.property);
  if (!origin) {
    throw new Error(
      `${input.property} is a domain property with no public origin, so there is no address to read.`,
    );
  }
  const { data: run, error: runError } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: "site_watch",
      target: input.property,
      strategy: "nightly_direct_read",
      actor_id: input.actorId,
      status: "running",
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`Could not open a live-site run: ${runError?.message ?? "no row"}`);
  }
  const startedAt = Date.now();
  const finish = async (patch: Record<string, unknown>) => {
    const { error } = await admin
      .from("measurement_runs")
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        ...patch,
      })
      .eq("id", run.id);
    if (error) throw new Error(`Could not close the live-site run: ${error.message}`);
  };

  try {
    const documents = await readSiteDocuments(origin);
    const listed = [
      ...new Set([`${origin}/`, ...documents.sitemapUrls.filter((url) => url.startsWith(origin))]),
    ];
    const urls = listed.slice(0, SITE_WATCH_PAGE_LIMIT);
    const observedOn = utcDate(now);
    const fetched = await readAll(urls);

    const rows: Database["public"]["Tables"]["site_watch_reads"]["Insert"][] = urls.map((url) => {
      const page = fetched.get(url)!;
      return {
        tenant_id: input.tenantId,
        property: input.property,
        origin,
        url,
        observed_on: observedOn,
        observed_at: now.toISOString(),
        status: page.status,
        final_url: page.finalUrl,
        noindex: page.noindex,
        robots: page.robots,
        canonical: page.canonical,
        title: page.title,
        error: page.error,
        run_id: run.id,
      };
    });
    const { error: upsertError } = await admin
      .from("site_watch_reads")
      .upsert(rows, { onConflict: "tenant_id,url,observed_on" });
    if (upsertError) throw new Error(upsertError.message);

    // The most recent earlier read of each address. Newest first, bounded to
    // a few nights' worth of rows, and the first row seen per address wins.
    const { data: earlier, error: earlierError } = await admin
      .from("site_watch_reads")
      .select("url, observed_on, status, final_url, noindex, canonical, error")
      .eq("tenant_id", input.tenantId)
      .lt("observed_on", observedOn)
      .in("url", urls)
      .order("observed_on", { ascending: false })
      .limit(urls.length * 3);
    if (earlierError) throw new Error(earlierError.message);
    const previous = new Map<string, NightlyPageRead>();
    for (const row of earlier ?? []) {
      if (previous.has(row.url)) continue;
      previous.set(row.url, {
        url: row.url,
        observedOn: row.observed_on,
        status: row.status,
        finalUrl: row.final_url,
        noindex: row.noindex,
        canonical: row.canonical,
        error: row.error,
      });
    }
    const current: NightlyPageRead[] = urls.map((url) => {
      const page = fetched.get(url)!;
      return {
        url,
        observedOn,
        status: page.status,
        finalUrl: page.finalUrl,
        noindex: page.noindex,
        canonical: page.canonical,
        error: page.error,
      };
    });
    const drafts = compareNights(previous, current);
    const findingsFiled = await fileDrafts(admin, input.tenantId, drafts);
    const comparedWith =
      [...previous.values()]
        .map((row) => row.observedOn)
        .sort()
        .at(-1) ?? null;

    const result: SiteWatchRunResult = {
      property: input.property,
      origin,
      observedOn,
      pagesListed: listed.length,
      pagesRead: urls.length,
      pagesUnanswered: current.filter((page) => page.status === null).length,
      pagesBeyondLimit: Math.max(0, listed.length - urls.length),
      comparedWith,
      findingsFiled,
    };
    await finish({ status: "succeeded" });
    await logActivity(admin, {
      tenantId: input.tenantId,
      actorKind: input.actorId ? "user" : "system",
      actorId: input.actorId ?? "site-watch",
      verb: "site.watch.read",
      subjectKind: "tenant",
      subjectId: input.tenantId,
      summary: `Read ${result.pagesRead} live pages of ${origin} on ${observedOn}; ${result.pagesUnanswered} went unanswered; ${
        comparedWith
          ? `compared with ${comparedWith}, ${findingsFiled} new finding(s)`
          : "no earlier night to compare with"
      }.`,
      payload: { ...result },
    });
    return result;
  } catch (error) {
    await finish({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
