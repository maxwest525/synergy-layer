import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { buildGscWindowObservation, ptDate, SOURCE_ROLES, type GscSnapshot, type MeasurementProvider } from "./change-measurement";

type Client = SupabaseClient<Database>;
type Cycle = Database["public"]["Tables"]["change_measurement_cycles"]["Row"];
type Window = Database["public"]["Tables"]["change_measurement_windows"]["Row"];

const json = (value: unknown): Json => value as Json;
const asRecords = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];

async function append(admin: Client, input: { cycleId: string; windowId: string; provider: MeasurementProvider; status: "complete" | "empty" | "partial"; payload: unknown; refs?: unknown; provenance?: unknown }) {
  const { error } = await admin.rpc("append_change_measurement_observation", {
    _cycle_id: input.cycleId, _window_id: input.windowId, _provider: input.provider,
    _source_role: SOURCE_ROLES[input.provider], _status: input.status, _payload: json(input.payload),
    _source_refs: json(input.refs ?? []), _provenance: json(input.provenance ?? {}),
  });
  if (error) throw new Error(error.message);
}

function evidenceGroup(evidence: unknown, source: string): Record<string, unknown> | null {
  return asRecords(evidence).find((row) => row.source === source) ?? null;
}

async function captureApprovalContext(admin: Client, cycle: Cycle, window: Window, change: Database["public"]["Tables"]["change_requests"]["Row"]) {
  const live = evidenceGroup(change.evidence, "live_page");
  await append(admin, { cycleId: cycle.id, windowId: window.id, provider: "live_page", status: live ? "complete" : "empty", payload: live ?? { missing: true }, provenance: { capturedFrom: "immutable_approval_snapshot", approvedAt: cycle.approved_at } });
  const organic = evidenceGroup(change.evidence, "dataforseo_competitors");
  const organicRows = asRecords(organic?.rows);
  await append(admin, { cycleId: cycle.id, windowId: window.id, provider: "dataforseo_organic", status: organicRows.length ? "complete" : "empty", payload: { rows: organicRows }, refs: organicRows.map((row) => row.snapshotId).filter(Boolean), provenance: { capturedFrom: "approved_proposal_evidence", role: "enrichment" } });

  const context = change.generation_context && typeof change.generation_context === "object" && !Array.isArray(change.generation_context) ? change.generation_context as Record<string, unknown> : {};
  const knowledgeIds = Array.isArray(context.guidanceEntryIds) ? context.guidanceEntryIds : [];
  const knowledgeRefs = Array.isArray(context.guidanceSourceRefs) ? context.guidanceSourceRefs : [];
  await append(admin, { cycleId: cycle.id, windowId: window.id, provider: "knowledge", status: knowledgeIds.length ? "complete" : "empty", payload: { entryIds: knowledgeIds, sourceRefs: knowledgeRefs, purpose: "Interpretation prompts only; not empirical evidence." }, refs: knowledgeRefs, provenance: { capturedFrom: "approved_generation_context", role: "devils_advocate" } });

  const [{ data: creatives, error: creativeError }, { data: paid, error: paidError }] = await Promise.all([
    admin.from("ad_creatives").select("id,advertiser_fk,headline,long_headline,snippet,call_to_action,target_domain,first_shown,last_shown,retrieved_at,source_url,content_checksum").eq("tenant_id", cycle.tenant_id).lte("retrieved_at", cycle.approved_at).order("retrieved_at", { ascending: false }).limit(50),
    admin.from("ad_live_serp_observations").select("id,keyword,reporting_date,ad_count,ads_payload,source_url,request_fingerprint,observed_at").eq("tenant_id", cycle.tenant_id).lte("observed_at", cycle.approved_at).order("observed_at", { ascending: false }).limit(50),
  ]);
  if (creativeError) throw new Error(creativeError.message);
  if (paidError) throw new Error(paidError.message);
  await append(admin, { cycleId: cycle.id, windowId: window.id, provider: "serpapi_transparency", status: creatives?.length ? "complete" : "empty", payload: { rows: creatives ?? [] }, refs: (creatives ?? []).map((row) => row.id), provenance: { cutoff: cycle.approved_at, role: "paid messaging corroboration; not organic outcome evidence" } });
  await append(admin, { cycleId: cycle.id, windowId: window.id, provider: "serpapi_paid_serp", status: paid?.length ? "complete" : "empty", payload: { rows: paid ?? [] }, refs: (paid ?? []).map((row) => row.id), provenance: { cutoff: cycle.approved_at, role: "paid SERP corroboration; not organic outcome evidence" } });
}

async function captureGsc(admin: Client, cycle: Cycle, window: Window) {
  if (!cycle.gsc_property) return;
  const { data, error } = await admin.from("search_console_snapshots")
    .select("id,property,kind,period_start_pt,period_end_pt,data_state,possibly_truncated,checksum,collected_at,payload")
    .eq("tenant_id", cycle.tenant_id).eq("property", cycle.gsc_property).eq("kind", "page_query")
    .gte("period_start_pt", window.period_start_pt).lte("period_end_pt", window.period_end_pt)
    .order("collected_at", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  const observation = buildGscWindowObservation({ snapshots: (data ?? []) as GscSnapshot[], property: cycle.gsc_property, targetUrl: cycle.target_url, window: { windowDays: window.window_days as 0 | 7 | 14 | 28, periodStartPt: window.period_start_pt, periodEndPt: window.period_end_pt } });
  await append(admin, { cycleId: cycle.id, windowId: window.id, provider: "gsc", status: observation.status, payload: observation, refs: observation.sourceRefs, provenance: { property: cycle.gsc_property, targetUrl: cycle.target_url, dataState: "final", reportingTimezone: "America/Los_Angeles", exactPageMatch: true } });
}

/** Materializes stored evidence only. It makes no provider calls and never changes workflow state. */
export async function reconcileChangeMeasurements(admin: Client, tenantId?: string): Promise<{ cycles: number; windows: number }> {
  let query = admin.from("change_measurement_cycles").select("*");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data: cycles, error } = await query;
  if (error) throw new Error(error.message);
  let windowsProcessed = 0;
  const todayPt = ptDate(new Date());
  for (const cycle of cycles ?? []) {
    const [{ data: change, error: changeError }, { data: windows, error: windowError }] = await Promise.all([
      admin.from("change_requests").select("*").eq("id", cycle.change_request_id).eq("tenant_id", cycle.tenant_id).single(),
      admin.from("change_measurement_windows").select("*").eq("cycle_id", cycle.id).eq("tenant_id", cycle.tenant_id).lte("available_after_pt", todayPt).order("window_days"),
    ]);
    if (changeError) throw new Error(changeError.message);
    if (windowError) throw new Error(windowError.message);
    for (const window of windows ?? []) {
      if (window.window_days === 0) await captureApprovalContext(admin, cycle, window, change);
      await captureGsc(admin, cycle, window);
      windowsProcessed += 1;
    }
  }
  return { cycles: cycles?.length ?? 0, windows: windowsProcessed };
}

export async function recordRenderedLiveAnchor(admin: Client, changeRequestId: string, actorId: string, proof: unknown) {
  const { data: cycle, error } = await admin.from("change_measurement_cycles").select("id,tenant_id").eq("change_request_id", changeRequestId).single();
  if (error) throw new Error(error.message);
  const { error: revisionError } = await admin.rpc("append_change_measurement_revision", { _cycle_id: cycle.id, _window_id: null, _actor_id: actorId, _kind: "live_anchor", _summary: "Exact approved wording was proven on the rendered canonical page. This anchors measurement; it is not a success judgment.", _detail: json(proof) });
  if (revisionError) throw new Error(revisionError.message);
  await reconcileChangeMeasurements(admin, cycle.tenant_id);
}

export async function fetchChangeMeasurementHistory(client: Client, tenantId: string, changeRequestId: string) {
  const { data: cycle, error } = await client.from("change_measurement_cycles").select("*").eq("tenant_id", tenantId).eq("change_request_id", changeRequestId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cycle) return { cycle: null, windows: [], observations: [], revisions: [] };
  const [{ data: windows, error: windowError }, { data: observations, error: observationError }, { data: revisions, error: revisionError }] = await Promise.all([
    client.from("change_measurement_windows").select("*").eq("tenant_id", tenantId).eq("cycle_id", cycle.id).order("window_days"),
    client.from("change_measurement_observations").select("*").eq("tenant_id", tenantId).eq("cycle_id", cycle.id).order("captured_at", { ascending: false }),
    client.from("change_measurement_revisions").select("*").eq("tenant_id", tenantId).eq("cycle_id", cycle.id).order("created_at", { ascending: false }),
  ]);
  if (windowError) throw new Error(windowError.message);
  if (observationError) throw new Error(observationError.message);
  if (revisionError) throw new Error(revisionError.message);
  return { cycle, windows: windows ?? [], observations: observations ?? [], revisions: revisions ?? [] };
}
