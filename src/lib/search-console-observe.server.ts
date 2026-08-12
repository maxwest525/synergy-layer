import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "./os.server";
import { reconcileAppliedChangeEvidence } from "./change-requests.server";
import { evaluateSnapshots, type RuleRunResult } from "./search-console-rules.server";
import { SearchConsoleFailure, collectDaily, getSelectedProperty } from "./search-console.server";

type Client = SupabaseClient<Database>;

const CAPABILITY_KEY = "search.console";

async function setHealth(
  client: Client,
  health: Database["public"]["Enums"]["health_state"],
): Promise<void> {
  await client
    .from("capabilities")
    .update({ health, last_run_at: new Date().toISOString() })
    .eq("key", CAPABILITY_KEY);
}

async function markPropertyObserved(client: Client, property: string, observedAt: string): Promise<void> {
  const { error } = await client
    .from("search_console_properties")
    .update({ last_observed_at: observedAt })
    .eq("site_url", property);
  if (error) throw new SearchConsoleFailure("persistence", error.message);
}

export type ObserveResult = {
  ok: boolean;
  property: string | null;
  reportingDate: string | null;
  emptyResult: boolean;
  rules: RuleRunResult | null;
  outcomes: { waiting: number; ready: number; newlyReady: number } | null;
  error?: string;
  reason?: string;
};

/**
 * Read-only daily observation. An empty result set completes successfully and
 * leaves health healthy; only a real fault degrades health and files an alert.
 */
export async function observeSearchConsole(client: Client): Promise<ObserveResult> {
  try {
    const property = await getSelectedProperty(client);
    if (!property) {
      throw new SearchConsoleFailure(
        "validation",
        "No Search Console property is selected. An operator must choose an accessible property first.",
      );
    }

    const collection = await collectDaily(client, property);
    const observedAt = new Date().toISOString();
    await markPropertyObserved(client, property, observedAt);

    if (!collection.reportingDate) {
      await logActivity(client, {
        verb: "capability.observation_completed",
        subjectKind: "capability",
        summary: `Search Console observation completed for ${property}; Google returned no finalized reporting date.`,
        payload: {
          property,
          reportingDate: null,
          emptyResult: true,
          snapshotsAdded: collection.snapshotIds.length,
          outcomeEvidenceReady: 0,
        },
      });
      await setHealth(client, "healthy");
      return {
        ok: true,
        property,
        reportingDate: null,
        emptyResult: true,
        rules: null,
        outcomes: null,
      };
    }

    const rules = await evaluateSnapshots(client, property, collection.reportingDate);
    const outcomes = await reconcileAppliedChangeEvidence(client);
    await logActivity(client, {
      verb: "capability.observation_completed",
      subjectKind: "capability",
      summary: `Search Console observation completed for ${property} through ${collection.reportingDate}.`,
      payload: {
        property,
        reportingDate: collection.reportingDate,
        emptyResult: collection.emptyResult,
        snapshotsAdded: collection.snapshotIds.length,
        outcomeEvidenceReady: outcomes.newlyReady,
        outcomeEvidenceWaiting: outcomes.waiting,
      },
    });
    await setHealth(client, "healthy");

    return {
      ok: true,
      property,
      reportingDate: collection.reportingDate,
      emptyResult: collection.emptyResult,
      rules,
      outcomes,
    };
  } catch (error) {
    const failure =
      error instanceof SearchConsoleFailure
        ? error
        : new SearchConsoleFailure("unknown", error instanceof Error ? error.message : String(error));

    await setHealth(client, "failing");
    await logActivity(client, {
      verb: "capability.connection_status_observed_degraded",
      subjectKind: "capability",
      summary: `Search Console observation failed: ${failure.message}`,
      payload: { reason: failure.reason },
    });
    await fileInboxItem(client, {
      lane: "needs_attention",
      sourceModule: "search-console",
      title: "Search Console observation failed",
      summary: failure.message,
      priority: 1,
      subjectKind: "capability",
      actions: [{ kind: "open" }],
    });

    return {
      ok: false,
      property: null,
      reportingDate: null,
      emptyResult: false,
      rules: null,
      outcomes: null,
      error: failure.message,
      reason: failure.reason,
    };
  }
}
