import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { KEYWORD_CONFIG } from "./keywords.server";
import { LABS_CONFIG, labsCall } from "./labs.server";

type Client = SupabaseClient<Database>;

/**
 * Difficulty and intent for the candidates sitting in the approval queue.
 *
 * Both endpoints take the whole list in one task, so the run is two Labs
 * tasks regardless of queue length — up to the batch cap below. Both are
 * metered, so this never fires on a page load or a schedule — only on an
 * operator click with the estimate on it.
 *
 * It raises no finding and changes no review state. It writes into
 * `keyword_candidates.metrics` so the person deciding sees more than a volume.
 *
 * Stated assumption: response shape from DataForSEO docs, not yet verified
 * against a live snapshot — diff the first real snapshot against this fixture
 * and update both together before trusting the numbers.
 */

/** One bulk_keyword_difficulty task plus one search_intent task. */
export const ENRICHMENT_TASK_COUNT = 2;

export function estimatedEnrichmentCostUsd(): number {
  return Number((ENRICHMENT_TASK_COUNT * LABS_CONFIG.estimatedUsdPerTask).toFixed(2));
}

/**
 * Stated assumption: no Labs-specific batch limit has been fetched from
 * DataForSEO's docs. The practice reference is the repo's own digest, which
 * documents the Backlinks family's bulk endpoint as capped "up to 1000
 * domains" (docs/superpowers/research/2026-08-21-dataforseo-recipe-catalog.md:19).
 * The two Labs bulk calls here are capped at the same order of magnitude
 * until a Labs-specific limit is confirmed against a live response.
 */
export const ENRICHMENT_BATCH_CAP = 1000;

/** The first N pending candidates when the queue exceeds the cap. */
export function selectEnrichmentBatch<T>(pending: readonly T[]): T[] {
  return pending.slice(0, ENRICHMENT_BATCH_CAP);
}

export type Enrichment = {
  readonly keywordDifficulty: number | null;
  readonly searchIntent: string | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Count of rows whose response shape didn't carry a keyword to key off — skipped rather than guessed at. */
export function countUnparsedEnrichmentItems(rows: readonly Record<string, unknown>[]): number {
  return rows.filter((row) => typeof row["keyword"] !== "string" || row["keyword"].trim() === "")
    .length;
}

export function mergeEnrichment(
  difficultyRows: readonly Record<string, unknown>[],
  intentRows: readonly Record<string, unknown>[],
): Map<string, Enrichment> {
  const merged = new Map<string, Enrichment>();

  for (const row of difficultyRows) {
    const keyword = String(row["keyword"] ?? "")
      .trim()
      .toLowerCase();
    if (!keyword) continue;
    merged.set(keyword, {
      keywordDifficulty: num(row["keyword_difficulty"]),
      searchIntent: merged.get(keyword)?.searchIntent ?? null,
    });
  }

  for (const row of intentRows) {
    const keyword = String(row["keyword"] ?? "")
      .trim()
      .toLowerCase();
    if (!keyword) continue;
    const intent = (row["keyword_intent"] ?? {}) as Record<string, unknown>;
    const label = typeof intent["label"] === "string" ? intent["label"] : null;
    merged.set(keyword, {
      keywordDifficulty: merged.get(keyword)?.keywordDifficulty ?? null,
      searchIntent: label,
    });
  }

  return merged;
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

export async function enrichPendingCandidates(
  client: Client,
  tenantId: string,
): Promise<{
  enriched: number;
  costUsd: number;
  sentThisRun: number;
  pendingTotal: number;
  unparsed: number;
}> {
  const { data: allPending, error } = await client
    .from("keyword_candidates")
    .select("id, keyword, metrics")
    .eq("tenant_id", tenantId)
    .eq("review_state", "pending");
  if (error) throw new Error(error.message);

  if ((allPending ?? []).length === 0) {
    throw new Error(
      "No keyword candidates are waiting for a decision, so there is nothing to score.",
    );
  }

  const pending = selectEnrichmentBatch(allPending ?? []);
  const keywords = pending.map((row) => row.keyword);

  const difficulty = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/bulk_keyword_difficulty/live",
    "labs_bulk_keyword_difficulty",
    `${keywords.length} pending candidates`,
    {
      keywords,
      location_code: KEYWORD_CONFIG.locationCode,
      language_code: KEYWORD_CONFIG.languageCode,
    },
  );

  const intent = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/search_intent/live",
    "labs_search_intent",
    `${keywords.length} pending candidates`,
    { keywords, language_code: KEYWORD_CONFIG.languageCode },
  );

  const difficultyRows = await snapshotRows(client, difficulty.snapshotId);
  const intentRows = await snapshotRows(client, intent.snapshotId);
  const unparsed =
    countUnparsedEnrichmentItems(difficultyRows) + countUnparsedEnrichmentItems(intentRows);
  const merged = mergeEnrichment(difficultyRows, intentRows);

  let enriched = 0;
  for (const candidate of pending) {
    const scores = merged.get(candidate.keyword.trim().toLowerCase());
    if (scores === undefined) continue;
    const { error: updateError } = await client
      .from("keyword_candidates")
      .update({
        metrics: {
          ...((candidate.metrics ?? {}) as Record<string, unknown>),
          keyword_difficulty: scores.keywordDifficulty,
          search_intent: scores.searchIntent,
          enriched_at: new Date().toISOString(),
        } as never,
      })
      .eq("id", candidate.id);
    if (!updateError) enriched += 1;
  }

  return {
    enriched,
    costUsd: difficulty.costUsd + intent.costUsd,
    sentThisRun: pending.length,
    pendingTotal: (allPending ?? []).length,
    unparsed,
  };
}
