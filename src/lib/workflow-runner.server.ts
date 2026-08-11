import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "./os.server";

type Client = SupabaseClient<Database>;

export type WorkflowNode = {
  key: string;
  kind: "agent" | "capability" | "approval" | "condition";
  ref?: string;
  inputs?: Record<string, unknown>;
};

export type WorkflowEdge = { from: string; to: string; when?: string };

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

export function parseGraph(graph: unknown): WorkflowGraph {
  const value = (graph ?? {}) as Partial<WorkflowGraph>;
  return { nodes: value.nodes ?? [], edges: value.edges ?? [] };
}

/** Topological order of the declarative DAG; cycles are reported, not run. */
export function orderNodes(graph: WorkflowGraph): WorkflowNode[] {
  const incoming = new Map<string, number>();
  graph.nodes.forEach((node) => incoming.set(node.key, 0));
  graph.edges.forEach((edge) => incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1));

  const ready = graph.nodes.filter((node) => (incoming.get(node.key) ?? 0) === 0);
  const ordered: WorkflowNode[] = [];

  while (ready.length > 0) {
    const node = ready.shift()!;
    ordered.push(node);
    graph.edges
      .filter((edge) => edge.from === node.key)
      .forEach((edge) => {
        const next = (incoming.get(edge.to) ?? 0) - 1;
        incoming.set(edge.to, next);
        if (next === 0) {
          const target = graph.nodes.find((candidate) => candidate.key === edge.to);
          if (target) ready.push(target);
        }
      });
  }

  if (ordered.length !== graph.nodes.length) {
    throw new Error("Workflow graph contains a cycle");
  }
  return ordered;
}

type RunResult = { runId: string; state: Database["public"]["Enums"]["run_state"] };

/**
 * Executes a workflow graph node by node, recording one step row per node.
 * Approval nodes park the run and file a pending-approval Inbox item.
 */
export async function runWorkflow(
  client: Client,
  workflowId: string,
  triggerSource: string,
  actorId: string | null,
): Promise<RunResult> {
  const { data: workflow, error: workflowError } = await client
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  if (workflowError) throw new Error(workflowError.message);
  if (!workflow) throw new Error("Workflow not found");

  const graph = parseGraph(workflow.graph);
  const ordered = orderNodes(graph);
  const startedAt = new Date();

  const { data: run, error: runError } = await client
    .from("workflow_runs")
    .insert({
      tenant_id: await requireTenantId(client),
      workflow_id: workflowId,
      state: "running",
      trigger_source: triggerSource,
      started_at: startedAt.toISOString(),
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  let finalState: Database["public"]["Enums"]["run_state"] = "succeeded";
  let failure: string | null = null;

  for (const [index, node] of ordered.entries()) {
    const stepStart = Date.now();
    const { data: step, error: stepError } = await client
      .from("workflow_steps")
      .insert({
        tenant_id: await requireTenantId(client),
        run_id: run.id,
        node_key: node.key,
        node_kind: node.kind,
        ref: node.ref ?? null,
        sequence: index,
        state: "running",
        started_at: new Date().toISOString(),
        input: (node.inputs ?? {}) as never,
      })
      .select("id")
      .single();
    if (stepError) throw new Error(stepError.message);

    if (node.kind === "approval") {
      await client
        .from("workflow_steps")
        .update({ state: "awaiting_approval" })
        .eq("id", step.id);
      finalState = "awaiting_approval";
      await fileInboxItem(client, {
        lane: "pending_approval",
        sourceModule: "workflows",
        title: `Approval required: ${workflow.name}`,
        summary: `Run is parked at the "${node.key}" approval node.`,
        priority: 1,
        subjectKind: "workflow_run",
        subjectId: run.id,
        actions: [{ kind: "approve" }, { kind: "open" }],
      });
      break;
    }

    const outcome = await executeNode(client, node, run.id);
    const duration = Date.now() - stepStart;

    await client
      .from("workflow_steps")
      .update({
        state: outcome.ok ? "succeeded" : "failed",
        output: (outcome.output ?? {}) as never,
        error: outcome.error ?? null,
        finished_at: new Date().toISOString(),
        duration_ms: duration,
      })
      .eq("id", step.id);

    if (!outcome.ok) {
      finalState = "failed";
      failure = outcome.error ?? "Step failed";
      break;
    }
  }

  const finishedAt = new Date();
  await client
    .from("workflow_runs")
    .update({
      state: finalState,
      error: failure,
      finished_at: finalState === "awaiting_approval" ? null : finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    })
    .eq("id", run.id);

  await client
    .from("workflows")
    .update({ health: finalState === "failed" ? "failing" : "healthy" })
    .eq("id", workflowId);

  await logActivity(client, {
    actorKind: actorId ? "user" : "system",
    actorId,
    verb: `run.${finalState}`,
    subjectKind: "workflow",
    subjectId: workflowId,
    summary: `${workflow.name} run ${finalState.replace("_", " ")}.`,
    payload: { runId: run.id, triggerSource },
  });

  if (finalState === "failed") {
    await fileInboxItem(client, {
      lane: "needs_attention",
      sourceModule: "workflows",
      title: `${workflow.name} failed`,
      summary: failure,
      priority: 1,
      subjectKind: "workflow",
      subjectId: workflowId,
      actions: [{ kind: "open" }, { kind: "run" }],
    });
  }

  return { runId: run.id, state: finalState };
}

type NodeOutcome = { ok: boolean; output?: Record<string, unknown>; error?: string };

async function executeNode(client: Client, node: WorkflowNode, runId: string): Promise<NodeOutcome> {
  if (node.kind === "condition") {
    return { ok: true, output: { evaluated: true } };
  }

  if (node.kind === "capability") {
    const { data: capability, error } = await client
      .from("capabilities")
      .select("id, name, integration_state")
      .eq("key", node.ref ?? "")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!capability) return { ok: false, error: `Unknown capability "${node.ref}"` };
    if (capability.integration_state !== "real") {
      return { ok: false, error: `Capability "${capability.name}" is not authorised yet.` };
    }

    const specialised =
      (await runSearchConsoleNode(client, node.ref ?? "")) ??
      (await runResearchNode(client, node.ref ?? "")) ??
      (await runSeoValidationNode(client, node.ref ?? "", runId)) ??
      (await runSerpCompetitorNode(client, node.ref ?? "")) ??
      (await runAdsTransparencyNode(client, node.ref ?? "", runId)) ??
      (await runDataForSeoNode(client, node.ref ?? "", runId));
    if (specialised && !specialised.ok) return specialised;


    await client
      .from("capabilities")
      .update({ last_run_at: new Date().toISOString(), health: "healthy" })
      .eq("id", capability.id);
    return { ok: true, output: { capability: capability.name, ...(specialised?.output ?? {}) } };
  }

  const { data: agent, error } = await client
    .from("agents")
    .select("id, name")
    .eq("key", node.ref ?? "")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!agent) return { ok: false, error: `Unknown agent "${node.ref}"` };

  await client
    .from("agents")
    .update({ current_task: `Executing node ${node.key}`, last_run_at: new Date().toISOString() })
    .eq("id", agent.id);

  return { ok: true, output: { agent: agent.name, node: node.key } };
}

/**
 * Search Console nodes run the real read-only pipeline. An empty result is a
 * successful step; only a genuine fault fails the node.
 */
async function runSearchConsoleNode(
  client: Client,
  ref: string,
): Promise<NodeOutcome | null> {
  if (ref === "search.console") {
    const { collectDaily, getSelectedProperty } = await import("./search-console.server");
    const property = await getSelectedProperty(client);
    if (!property) {
      return { ok: false, error: "No Search Console property is selected." };
    }
    try {
      const result = await collectDaily(client, property);
      return {
        ok: true,
        output: {
          property: result.property,
          reportingDate: result.reportingDate,
          emptyResult: result.emptyResult,
          snapshots: result.snapshotIds.length,
        },
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (ref === "search.console.rules") {
    const { getSelectedProperty } = await import("./search-console.server");
    const { evaluateSnapshots } = await import("./search-console-rules.server");
    const property = await getSelectedProperty(client);
    if (!property) {
      return { ok: false, error: "No Search Console property is selected." };
    }
    try {
      // Rules run over stored snapshots only; no second API call.
      const { data: latest, error: latestError } = await client
        .from("search_console_snapshots")
        .select("period_end_pt")
        .eq("property", property)
        .order("period_end_pt", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) return { ok: false, error: latestError.message };
      const reportingDate = latest?.period_end_pt ?? null;
      if (!reportingDate) {
        return { ok: true, output: { noChange: true, reason: "No stored snapshot to evaluate." } };
      }
      const result = await evaluateSnapshots(client, property, reportingDate);
      return { ok: true, output: { ...result } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return null;
}

/**
 * Research nodes run the real Perplexity + Firecrawl pass. A pass that files no
 * new entries is a successful step; only a genuine fault fails the node.
 */
async function runResearchNode(client: Client, ref: string): Promise<NodeOutcome | null> {
  if (ref !== "cap.web_research") return null;
  const { runWebResearch } = await import("./web-research.server");
  try {
    const result = await runWebResearch(client);
    return { ok: true, output: { ...result } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * SEO validation runs the real rule engine over stored Search Console
 * snapshots. Zero findings is a successful step, not a failure.
 */
async function runSeoValidationNode(
  client: Client,
  ref: string,
  runId: string,
): Promise<NodeOutcome | null> {
  if (ref !== "seo.validation") return null;
  try {
    const { runSeoValidation } = await import("./seo-validation.server");
    const result = await runSeoValidation(client, runId);
    return { ok: true, output: { ...result } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Immutable published origin: SERP postbacks must reach a stable URL. */
const PUBLIC_ORIGIN =
  process.env["AOOS_PUBLIC_ORIGIN"] ??
  "https://project--4aa4b3cf-b3ab-4721-aff6-e0d55ce13276.lovable.app";

/**
 * DataForSEO observation nodes. Ingestion only: they write immutable evidence
 * and never produce recommendations. A no-change pass is a successful step.
 *
 * Keyword selection is never automatic. SERP observes the operator-approved
 * set and nothing else; an empty set stops the node rather than inventing a
 * query to search for.
 */
async function runDataForSeoNode(
  client: Client,
  ref: string,
  runId: string,
): Promise<NodeOutcome | null> {
  if (!ref.startsWith("cap.dataforseo_")) return null;

  const { requireTenantId } = await import("./tenant.server");
  const { getSelectedProperty } = await import("./search-console.server");

  try {
    const tenantId = await requireTenantId(client);
    const property = await getSelectedProperty(client);
    const target = (property ?? "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!target) return { ok: false, error: "No owned property is selected to observe." };

    if (ref === "cap.dataforseo_labs") {
      const { suggestKeywords } = await import("./dataforseo/keywords.server");
      const result = await suggestKeywords(client, tenantId, target, { runId, key: "dfs-keyword-discovery" });
      return { ok: true, output: { target, ...result } };
    }

    if (ref === "cap.dataforseo_backlinks") {
      const { collectBacklinkEvidence } = await import("./dataforseo/backlink-evidence.server");
      const evidence = await collectBacklinkEvidence(client, tenantId, target, {
        runId,
        key: "dfs-backlink-baseline",
      });
      return {
        ok: true,
        output: {
          target,
          costUsd: evidence.costUsd,
          snapshots: evidence.normalized["snapshots"],
          missingFactors: evidence.missingFactors,
          healthSufficient: evidence.health.sufficient,
        },
      };
    }

    if (ref === "cap.dataforseo_serp") {
      const { getTrackedKeywords } = await import("./dataforseo/keywords.server");
      const { queueSerpTasks } = await import("./dataforseo/serp.server");
      const keywords = await getTrackedKeywords(client, tenantId);
      if (keywords.length === 0) {
        return {
          ok: false,
          error:
            "No approved keywords to observe. Run keyword discovery and approve a set in the Inbox first: AOOS will not queue a keyword nobody chose.",
        };
      }
      const result = await queueSerpTasks(client, tenantId, keywords, PUBLIC_ORIGIN, {
        runId,
        key: "dfs-serp-observe",
      });
      return { ok: true, output: { target, keywords: keywords.length, ...result } };
    }

    return { ok: true, output: { target } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Rebuilds the competitor set from observed SERP results. Costs nothing: it
 * re-reads stored evidence and never calls the provider.
 */
async function runSerpCompetitorNode(client: Client, ref: string): Promise<NodeOutcome | null> {
  if (ref !== "serp.competitors" && ref !== "serp.competitor_intelligence" && ref !== "competitor.page_observation") {
    return null;
  }
  try {
    const { requireTenantId } = await import("./tenant.server");
    const { getSelectedProperty } = await import("./search-console.server");
    const { deriveCompetitorsFromSerp } = await import("./dataforseo/competitors.server");

    const tenantId = await requireTenantId(client);
    const property = await getSelectedProperty(client);
    const own = (property ?? "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!own) return { ok: false, error: "No owned property is selected." };

    if (ref === "serp.competitor_intelligence") {
      const { buildCompetitorProfiles } = await import("./dataforseo/competitor-intelligence.server");
      const { result } = await buildCompetitorProfiles(client, tenantId, own);
      return { ok: true, output: { ...result } };
    }

    if (ref === "competitor.page_observation") {
      const { readShortlistedProfiles } = await import("./dataforseo/competitor-intelligence.server");
      const { inspectShortlistPages } = await import("./dataforseo/competitor-pages.server");
      const profiles = await readShortlistedProfiles(client, tenantId);
      if (profiles.length === 0) {
        return { ok: true, output: { noChange: true, reason: "No shortlisted competitor to inspect." } };
      }
      const evidence = await inspectShortlistPages(client, tenantId, profiles);
      return { ok: true, output: { ...evidence } };
    }

    const result = await deriveCompetitorsFromSerp(client, tenantId, own);
    return { ok: true, output: { ...result } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Google Ads Transparency observation nodes. Read-only: they write immutable
 * paid-media evidence and never produce recommendations or ad copy. A pass
 * that changes nothing is a successful step, and missing credentials stop the
 * node with the exact blocker instead of a silent empty result.
 */
async function runAdsTransparencyNode(
  client: Client,
  ref: string,
  runId: string,
): Promise<NodeOutcome | null> {
  const handled = new Set([
    "cap.serpapi_ads_transparency",
    "ads.advertiser_resolution",
    "ads.creative_intelligence",
    "ads.landing_page_intelligence",
    "ads.live_serp_observation",
    "ads.vendor_network_analysis",
  ]);
  if (!handled.has(ref)) return null;

  try {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(client);

    if (ref === "ads.vendor_network_analysis") {
      const { analyzeVendorNetwork } = await import("./serpapi/network.server");
      const result = await analyzeVendorNetwork(client, tenantId);
      return { ok: true, output: { ...result } as Record<string, unknown> };
    }

    if (ref === "ads.landing_page_intelligence") {
      const { observeAdDestinations } = await import("./serpapi/landing-pages.server");
      const result = await observeAdDestinations(client, tenantId);
      if (result.destinations === 0) {
        return { ok: true, output: { noChange: true, reason: "No stored ad destination to observe yet." } };
      }
      return { ok: true, output: { ...result } };
    }

    const { serpApiCredentialsPresent } = await import("./serpapi/transport.server");
    if (!serpApiCredentialsPresent()) {
      return {
        ok: false,
        error:
          "SerpApi credentials are missing. Add SERPAPI_API_KEY in Project Settings, then re-run: AOOS will not fabricate paid-media evidence.",
      };
    }

    if (ref === "ads.advertiser_resolution") {
      const { resolveVendorAdvertisers } = await import("./serpapi/advertisers.server");
      const result = await resolveVendorAdvertisers(client, tenantId, { runId });
      return { ok: true, output: { ...result } as Record<string, unknown> };
    }

    if (ref === "ads.creative_intelligence") {
      const { ingestAdvertiserCreatives } = await import("./serpapi/creatives.server");
      const result = await ingestAdvertiserCreatives(client, tenantId, { runId });
      if (result.advertisers === 0) {
        return {
          ok: true,
          output: { noChange: true, reason: "No confirmed advertiser yet. Resolve and confirm a vendor advertiser first." },
        };
      }
      return { ok: true, output: { ...result } };
    }

    if (ref === "ads.live_serp_observation") {
      const { observeLivePaidSerps } = await import("./serpapi/live-serp.server");
      const result = await observeLivePaidSerps(client, tenantId, { runId });
      if (result.keywords === 0) {
        return { ok: false, error: "No approved keywords to observe on the paid SERP." };
      }
      return { ok: true, output: { ...result } as Record<string, unknown> };
    }

    const { probeSerpApiAccount } = await import("./serpapi/transport.server");
    const account = await probeSerpApiAccount();
    return { ok: true, output: { ...account } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
