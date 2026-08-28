import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { failureAlerts } from "./outcome-alerts";

type Client = SupabaseClient<Database>;

/** One module, one source string, so the idempotency read cannot drift from the write. */
const SOURCE_MODULE = "outcome-verdict";

/**
 * Files a needs-attention Inbox item for every change whose stored outcome the
 * verdict module graded a failure, once per change, ever. The read side is the
 * same assembly Site health renders (`fetchStoredOutcomes` + `gradeOutcomes`),
 * so the inbox can never disagree with the page about what failed.
 *
 * Idempotency is by existence, not by lane or resolution: an operator who
 * cleared the alert has seen it, and re-filing on every collection would turn
 * one failed change into a daily nag.
 */
export async function reconcileOutcomeAlerts(
  client: Client,
  /** The connected Search Console property, or null when none is selected. */
  property: string | null,
): Promise<{ failed: number; filed: number }> {
  const { requireTenantId } = await import("./tenant.server");
  const { fetchStoredOutcomes } = await import("./change-outcomes.server");
  const { gradeOutcomes } = await import("./site-health");

  const tenantId = await requireTenantId(client);
  const { outcomes } = await fetchStoredOutcomes(
    client,
    tenantId,
    new Date().toISOString(),
    property,
  );
  const alerts = failureAlerts(gradeOutcomes(outcomes));
  if (alerts.length === 0) return { failed: 0, filed: 0 };

  const { data: existing, error } = await client
    .from("inbox_items")
    .select("subject_id")
    .eq("tenant_id", tenantId)
    .eq("source_module", SOURCE_MODULE)
    .eq("subject_kind", "change_request")
    .in(
      "subject_id",
      alerts.map((alert) => alert.changeId),
    );
  if (error) throw new Error(error.message);
  const alreadyFiled = new Set((existing ?? []).map((row) => row.subject_id));

  const { fileInboxItem, logActivity } = await import("./os.server");
  let filed = 0;
  for (const alert of alerts) {
    if (alreadyFiled.has(alert.changeId)) continue;
    await fileInboxItem(client, {
      lane: "needs_attention",
      sourceModule: SOURCE_MODULE,
      title: `This fix did not work: ${alert.title}`,
      summary: `${alert.reason} That is the graded reading for the ${alert.windowDays} day evidence window. The change page holds the rollback control if you decide to undo it.`,
      priority: 2,
      subjectKind: "change_request",
      subjectId: alert.changeId,
      actions: [{ kind: "review", label: "Open the change", href: `/changes/${alert.changeId}` }],
      metadata: {
        verdict: "failure",
        windowDays: alert.windowDays,
        targetUrl: alert.targetUrl,
      },
      tenantId,
    });
    await logActivity(client, {
      verb: "change_request.outcome_failure_filed",
      subjectKind: "change_request",
      subjectId: alert.changeId,
      summary: `The ${alert.windowDays} day reading graded "${alert.title}" a failure and an Inbox item was filed.`,
      payload: { windowDays: alert.windowDays, targetUrl: alert.targetUrl },
      tenantId,
    });
    filed += 1;
  }
  return { failed: alerts.length, filed };
}
