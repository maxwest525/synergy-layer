import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { SearchConsoleFailure, inspectUrl } from "./search-console.server";

type Client = SupabaseClient<Database>;

export const SWEEP_LIMITS = {
  /** Inspections per scheduled run. Google's quota is ~2000/day; one daily run stays far under it. */
  perRun: 25,
  /** A URL inspected within this many days is not re-inspected. */
  refreshDays: 30,
  /** How many audited pages are considered as sweep candidates. */
  candidatePool: 800,
} as const;

export type SweepResult = {
  candidates: number;
  inspected: number;
  failed: number;
  skippedFresh: number;
};

/**
 * Quota-aware nightly URL inspection sweep. Walks the audited page set,
 * oldest-inspection-first, so index coverage is known for every page instead
 * of only the ones someone inspected by hand. Read-only at Google.
 */
export async function sweepUrlInspections(
  client: Client,
  property: string,
  limits: typeof SWEEP_LIMITS = SWEEP_LIMITS,
): Promise<SweepResult> {
  const { data: metaRows, error: metaError } = await client
    .from("page_metadata_observations")
    .select("url, observed_at")
    .order("observed_at", { ascending: false })
    .limit(limits.candidatePool);
  if (metaError) throw new SearchConsoleFailure("persistence", metaError.message);

  const candidates = [...new Set((metaRows ?? []).map((row) => row.url))];
  if (candidates.length === 0) {
    return { candidates: 0, inspected: 0, failed: 0, skippedFresh: 0 };
  }

  const { data: inspectionRows, error: inspectionError } = await client
    .from("search_console_url_inspections")
    .select("inspected_url, inspected_at")
    .eq("property", property)
    .order("inspected_at", { ascending: false })
    .limit(limits.candidatePool * 2);
  if (inspectionError) throw new SearchConsoleFailure("persistence", inspectionError.message);

  const lastInspected = new Map<string, string>();
  for (const row of inspectionRows ?? []) {
    if (!lastInspected.has(row.inspected_url)) {
      lastInspected.set(row.inspected_url, row.inspected_at);
    }
  }

  const cutoff = Date.now() - limits.refreshDays * 86_400_000;
  const due = candidates
    .filter((url) => {
      const at = lastInspected.get(url);
      return !at || new Date(at).getTime() < cutoff;
    })
    .sort((a, b) => {
      const atA = lastInspected.get(a);
      const atB = lastInspected.get(b);
      if (!atA && !atB) return 0;
      if (!atA) return -1;
      if (!atB) return 1;
      return new Date(atA).getTime() - new Date(atB).getTime();
    });

  let inspected = 0;
  let failed = 0;
  for (const url of due.slice(0, limits.perRun)) {
    try {
      await inspectUrl(client, property, url, null);
      inspected += 1;
    } catch {
      // A single URL failing (redirected, out of prefix, transient) must not
      // sink the sweep; the URL comes due again next run.
      failed += 1;
    }
  }

  await logActivity(client, {
    verb: "search_console.inspection_sweep",
    subjectKind: "capability",
    summary: `Inspection sweep for ${property}: ${inspected} inspected, ${failed} failed, ${candidates.length - due.length} fresh.`,
    payload: { property, inspected, failed, candidates: candidates.length, due: due.length },
  });

  return {
    candidates: candidates.length,
    inspected,
    failed,
    skippedFresh: candidates.length - due.length,
  };
}
