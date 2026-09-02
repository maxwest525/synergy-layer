import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "./os.server";
import { mayExecuteCapability } from "./serpapi/provider-gate";
import { allCapabilities } from "@/registry";

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

export function assertRunnableGraph(graph: WorkflowGraph): void {
  if (graph.nodes.some((node) => node.kind === "agent")) {
    throw new Error("This workflow cannot run because agent runtime is not implemented.");
  }
  if (graph.nodes.some((node) => node.kind === "approval")) {
    throw new Error("This workflow cannot run because approval continuation is not implemented.");
  }
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

type RunResult = {
  runId: string;
  state: Database["public"]["Enums"]["run_state"];
};

export type RunMode = "manual" | "auto";

/**
 * Capability keys that declare at least one mutating operation in the
 * registry. A run never advances into one of these on its own: an operator
 * presses the step. Read-only steps are cheap and reversible, mutating steps
 * are not.
 */
function mutatingCapabilityKeys(): Set<string> {
  const keys = new Set<string>();
  for (const capability of allCapabilities()) {
    if (
      (capability.operations ?? []).some(
        (operation: { mutates?: boolean }) => operation.mutates === true,
      )
    ) {
      keys.add(capability.key);
    }
  }
  return keys;
}

/** True when this step changes something outside AOOS, or needs a decision. */
export function isManualOnlyNode(node: WorkflowNode, mutating = mutatingCapabilityKeys()): boolean {
  if (node.kind === "approval") return true;
  if (node.kind === "capability") return mutating.has(node.ref ?? "");
  return false;
}

async function loadWorkflowGraph(client: Client, workflowId: string) {
  const { data: workflow, error } = await client
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!workflow) throw new Error("Workflow not found");
  const graph = parseGraph(workflow.graph);
  assertRunnableGraph(graph);
  return { workflow, ordered: orderNodes(graph) };
}

/**
 * Creates a run parked before its first step. Nothing executes here: a run is
 * a stored position plus the outputs collected so far, and it only moves when
 * something advances it.
 */
export async function startRun(
  client: Client,
  workflowId: string,
  triggerSource: string,
  actorId: string | null,
  mode: RunMode = "manual",
  tenant: string | null = null,
): Promise<RunResult> {
  const { workflow, ordered } = await loadWorkflowGraph(client, workflowId);
  // A scheduled run names its tenant; a manual run takes the operator's.
  const tenantId = await requireTenantId(client, tenant);

  const { data: run, error } = await client
    .from("workflow_runs")
    .insert({
      tenant_id: tenantId,
      workflow_id: workflowId,
      state: ordered.length === 0 ? "succeeded" : "queued",
      trigger_source: triggerSource,
      mode,
      cursor: 0,
      total_steps: ordered.length,
      step_outputs: {},
    })
    .select("id, state")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(client, {
    actorKind: actorId ? "user" : "system",
    actorId,
    verb: "run.started",
    subjectKind: "workflow",
    subjectId: workflowId,
    summary: `${workflow.name} run created with ${ordered.length} steps waiting.`,
    payload: { runId: run.id, triggerSource, mode },
  });

  if (ordered.length > 0 && ordered[0]!.kind === "approval") {
    await parkForApproval(client, workflow, run.id, ordered[0]!);
  }

  return { runId: run.id, state: run.state };
}

async function parkForApproval(
  client: Client,
  workflow: { id: string; name: string },
  runId: string,
  node: WorkflowNode,
) {
  await client.from("workflow_runs").update({ state: "awaiting_approval" }).eq("id", runId);
  await fileInboxItem(client, {
    lane: "pending_approval",
    sourceModule: "workflows",
    title: `Approval required: ${workflow.name}`,
    summary: `The run is parked at "${node.key}". Approving it continues the same run from this point.`,
    priority: 1,
    subjectKind: "workflow_run",
    subjectId: runId,
    actions: [{ kind: "open", href: `/workflows/${workflow.id}` }],
  });
}

/**
 * Advances a run by exactly one step. The claim is single-flight, so two
 * presses or a press racing the scheduler cannot execute the same step twice.
 */
export async function advanceRun(
  client: Client,
  runId: string,
  actorId: string | null,
): Promise<RunResult & { stepKey: string | null; stepState: string | null }> {
  const { data: claim, error: claimError } = await client.rpc("claim_workflow_run_step", {
    p_run_id: runId,
    p_actor: actorId as string,
  });
  if (claimError) throw new Error(claimError.message);
  const claimed = Array.isArray(claim) ? claim[0] : claim;
  if (!claimed) throw new Error("Run could not be claimed.");
  const cursor = claimed.step_cursor as number;

  const { data: run, error: runError } = await client
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runError) throw new Error(runError.message);

  const { workflow, ordered } = await loadWorkflowGraph(client, run.workflow_id);
  const node = ordered[cursor];
  if (!node) throw new Error("Run position no longer matches the workflow definition.");

  // The run's own tenant, never re-resolved from the client.
  const tenantId = run.tenant_id;
  const stepStart = Date.now();
  const { data: step, error: stepError } = await client
    .from("workflow_steps")
    .insert({
      tenant_id: tenantId,
      run_id: runId,
      node_key: node.key,
      node_kind: node.kind,
      ref: node.ref ?? null,
      sequence: cursor,
      state: "running",
      started_at: new Date().toISOString(),
      input: (node.inputs ?? {}) as never,
    })
    .select("id")
    .single();
  if (stepError) throw new Error(stepError.message);

  const outcome: NodeOutcome =
    node.kind === "approval"
      ? actorId === null
        ? { ok: false, error: "An approval step needs a person to decide it." }
        : { ok: true, output: { decision: "approved", decidedBy: actorId } }
      : await executeNode(client, node, runId, tenantId);

  await client
    .from("workflow_steps")
    .update({
      state: outcome.ok ? "succeeded" : "failed",
      output: (outcome.output ?? {}) as never,
      error: outcome.error ?? null,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - stepStart,
    })
    .eq("id", step.id);

  const nextCursor = cursor + 1;
  const outputs = {
    ...((run.step_outputs ?? {}) as Record<string, unknown>),
    [node.key]: outcome.output ?? {},
  };
  const nextNode = ordered[nextCursor];

  let state: Database["public"]["Enums"]["run_state"];
  if (!outcome.ok) state = "failed";
  else if (!nextNode) state = "succeeded";
  else if (nextNode.kind === "approval") state = "awaiting_approval";
  else state = "queued";

  const finishedAt = new Date();
  await client
    .from("workflow_runs")
    .update({
      state,
      cursor: outcome.ok ? nextCursor : cursor,
      step_outputs: outputs as never,
      error: outcome.ok ? null : (outcome.error ?? "Step failed"),
      finished_at: state === "succeeded" || state === "failed" ? finishedAt.toISOString() : null,
      duration_ms: run.started_at
        ? finishedAt.getTime() - new Date(run.started_at).getTime()
        : null,
      last_advanced_at: finishedAt.toISOString(),
      last_advanced_by: actorId,
    })
    .eq("id", runId);

  if (state === "awaiting_approval" && nextNode) {
    await parkForApproval(client, workflow, runId, nextNode);
  }

  if (state === "succeeded" || state === "failed") {
    await client
      .from("workflows")
      .update({ health: state === "failed" ? "failing" : "healthy" })
      .eq("id", run.workflow_id);

    await logActivity(client, {
      actorKind: actorId ? "user" : "system",
      actorId,
      verb: `run.${state}`,
      subjectKind: "workflow",
      subjectId: run.workflow_id,
      summary: `${workflow.name} run ${state}.`,
      payload: { runId, triggerSource: run.trigger_source },
    });
  } else {
    await logActivity(client, {
      actorKind: actorId ? "user" : "system",
      actorId,
      verb: "run.step",
      subjectKind: "workflow",
      subjectId: run.workflow_id,
      summary: `${workflow.name}: step ${cursor + 1} (${node.key}) ${outcome.ok ? "succeeded" : "failed"}.`,
      payload: { runId, nodeKey: node.key },
    });
  }

  if (state === "failed") {
    await fileInboxItem(client, {
      lane: "needs_attention",
      sourceModule: "workflows",
      title: `${workflow.name} failed`,
      summary: outcome.error ?? "Step failed",
      priority: 1,
      subjectKind: "workflow",
      subjectId: run.workflow_id,
      actions: [{ kind: "open" }, { kind: "run" }],
    });
  }

  return {
    runId,
    state,
    stepKey: node.key,
    stepState: outcome.ok ? "succeeded" : "failed",
  };
}

/** Parks a run permanently, recording who stopped it and when. */
export async function cancelRun(
  client: Client,
  runId: string,
  actorId: string | null,
): Promise<RunResult> {
  const { data: run, error } = await client
    .from("workflow_runs")
    .select("id, state, workflow_id")
    .eq("id", runId)
    .single();
  if (error) throw new Error(error.message);
  if (run.state === "succeeded" || run.state === "failed" || run.state === "cancelled") {
    throw new Error(`This run is already ${run.state} and cannot be cancelled.`);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from("workflow_runs")
    .update({ state: "cancelled", cancelled_at: now, cancelled_by: actorId, finished_at: now })
    .eq("id", runId);
  if (updateError) throw new Error(updateError.message);

  await logActivity(client, {
    actorKind: actorId ? "user" : "system",
    actorId,
    verb: "run.cancelled",
    subjectKind: "workflow",
    subjectId: run.workflow_id,
    summary: "Run cancelled by operator.",
    payload: { runId },
  });

  return { runId, state: "cancelled" };
}

/**
 * Unattended entry point, used by the scheduler. It advances automatically
 * while the next step only reads, and parks the moment it reaches a step that
 * changes something external or needs a decision.
 */
export async function runWorkflow(
  client: Client,
  workflowId: string,
  triggerSource: string,
  actorId: string | null,
  tenant: string | null = null,
): Promise<RunResult> {
  const { ordered } = await loadWorkflowGraph(client, workflowId);
  const mutating = mutatingCapabilityKeys();
  const started = await startRun(client, workflowId, triggerSource, actorId, "auto", tenant);

  let state = started.state;
  let cursor = 0;
  while (state === "queued" && cursor < ordered.length) {
    const node = ordered[cursor]!;
    if (isManualOnlyNode(node, mutating)) break;
    const advanced = await advanceRun(client, started.runId, actorId);
    state = advanced.state;
    cursor += 1;
  }

  return { runId: started.runId, state };
}

type NodeOutcome = {
  ok: boolean;
  output?: Record<string, unknown>;
  error?: string;
};

async function executeNode(
  client: Client,
  node: WorkflowNode,
  runId: string,
  tenantId: string,
): Promise<NodeOutcome> {
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
    if (!mayExecuteCapability(node.ref ?? "", capability.integration_state)) {
      return {
        ok: false,
        error: `Capability "${capability.name}" is not authorised yet.`,
      };
    }

    const specialised =
      (await runSearchConsoleNode(client, node.ref ?? "", tenantId)) ??
      (await runResearchNode(client, node.ref ?? "")) ??
      (await runGa4Node(client, node.ref ?? "")) ??
      (await runUmamiNode(client, node.ref ?? "")) ??
      (await runSeoValidationNode(client, node.ref ?? "", runId)) ??
      (await runSerpCompetitorNode(client, node.ref ?? "", tenantId)) ??
      (await runAdsTransparencyNode(client, node.ref ?? "", runId, tenantId)) ??
      (await runDataForSeoNode(client, node.ref ?? "", runId, tenantId)) ??
      (await runSiteAuditNode(client, node.ref ?? "", tenantId)) ??
      (await runBacklinkFindingsNode(client, node.ref ?? "", tenantId)) ??
      (await runSiteWatchNode(client, node.ref ?? "", tenantId));
    // A key no runner recognises must refuse, not succeed. The old fall-through
    // stamped last_run_at and "healthy" for any unrecognised capability, which
    // is how a declared-but-unwired step passed as a working one.
    if (!specialised) {
      return {
        ok: false,
        error: `Capability "${capability.name}" (${node.ref}) has no execution path in the workflow runner, so this step refuses rather than reporting a success nothing earned.`,
      };
    }
    if (!specialised.ok) return specialised;

    await client
      .from("capabilities")
      .update({ last_run_at: new Date().toISOString(), health: "healthy" })
      .eq("id", capability.id);
    return {
      ok: true,
      output: { capability: capability.name, ...(specialised?.output ?? {}) },
    };
  }

  // No agent runtime exists: `runAgent` throws on every call and
  // `assertRunnableGraph` refuses any graph holding an agent node before a run
  // starts. This branch used to mark the agent row as executing the node and
  // return ok having done nothing, so a run that reached it would have read as
  // work done on /agents (CODE-19). It refuses by name instead.
  return {
    ok: false,
    error: `Agent node "${node.key}" cannot run: no agent runtime exists in AOOS.`,
  };
}

/**
 * Search Console nodes run the real read-only pipeline. An empty result is a
 * successful step; only a genuine fault fails the node.
 */
async function runSearchConsoleNode(
  client: Client,
  ref: string,
  tenantId: string,
): Promise<NodeOutcome | null> {
  if (ref === "search.console") {
    const { collectDaily, getSelectedProperty } = await import("./search-console.server");
    const property = await getSelectedProperty(client, tenantId);
    if (!property) {
      return { ok: false, error: "No Search Console property is selected." };
    }
    try {
      // The scheduled collection keeps the same ledger every other provider
      // keeps, so a failed night reaches the cadence card (CODE-54).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { withMeasurementRun } = await import("./measurement/run-ledger.server");
      const result = await withMeasurementRun(
        supabaseAdmin,
        { tenantId, provider: "gsc", target: property, strategy: "daily_collection" },
        () => collectDaily(client, property),
      );
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
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (ref === "search.console.inspect") {
    const { getSelectedProperty } = await import("./search-console.server");
    const { sweepUrlInspections } = await import("./search-console-sweep.server");
    const property = await getSelectedProperty(client, tenantId);
    if (!property) {
      return { ok: false, error: "No Search Console property is selected." };
    }
    try {
      const result = await sweepUrlInspections(client, property);
      return { ok: true, output: { property, ...result } };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (ref === "search.console.rules") {
    const { getSelectedProperty } = await import("./search-console.server");
    const { evaluateSnapshots } = await import("./search-console-rules.server");
    const property = await getSelectedProperty(client, tenantId);
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
        return {
          ok: true,
          output: { noChange: true, reason: "No stored snapshot to evaluate." },
        };
      }
      const result = await evaluateSnapshots(client, property, reportingDate);
      return { ok: true, output: { ...result } };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return null;
}

/**
 * GA4 nodes run one real Data API inventory read per tenant with a bound
 * property, or evaluate the stored snapshots with the rule engine. A provider
 * failure fails the node; it is never stored as zero.
 */
async function runGa4Node(client: Client, ref: string): Promise<NodeOutcome | null> {
  if (ref !== "cap.ga4" && ref !== "ga4.rules") return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  void client;

  if (ref === "ga4.rules") {
    const { runGa4DailyRules } = await import("./ga4-rules.server");
    try {
      // Rules run over stored snapshots only; no second API call.
      const result = await runGa4DailyRules(supabaseAdmin);
      if (result.attempted === 0) {
        return {
          ok: true,
          output: { noChange: true, reason: "No tenant has a GA4 property bound." },
        };
      }
      if (result.succeeded === 0) {
        return {
          ok: false,
          error: result.results
            .map((entry) => entry.error)
            .filter(Boolean)
            .join(" | "),
        };
      }
      return { ok: true, output: { ...result } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const { runGa4DailyObservation } = await import("./measurement/ga4.server");
  try {
    const result = await runGa4DailyObservation(supabaseAdmin);
    if (result.attempted === 0) {
      return {
        ok: true,
        output: { noChange: true, reason: "No tenant has a GA4 property bound." },
      };
    }
    if (result.succeeded === 0) {
      return {
        ok: false,
        error: result.results
          .map((entry) => entry.error)
          .filter(Boolean)
          .join(" | "),
      };
    }
    return { ok: true, output: { ...result } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Umami nodes run one real read-only observation per tenant against the
 * self-hosted instance. A refusal fails the node; it is never stored as zero.
 */
async function runUmamiNode(client: Client, ref: string): Promise<NodeOutcome | null> {
  if (ref !== "cap.umami") return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { observeUmami } = await import("./umami/observe.server");
  const { data, error } = await client.from("tenants").select("id");
  if (error) return { ok: false, error: error.message };
  const tenants = data ?? [];
  if (tenants.length === 0) {
    return { ok: true, output: { noChange: true, reason: "No tenant to observe." } };
  }
  const results: Record<string, unknown>[] = [];
  const failures: string[] = [];
  for (const tenant of tenants) {
    try {
      const result = await observeUmami(supabaseAdmin, supabaseAdmin, {
        tenantId: tenant.id,
        actorId: null,
      });
      results.push({ ...result });
    } catch (failure) {
      failures.push(failure instanceof Error ? failure.message : String(failure));
    }
  }
  if (results.length === 0) return { ok: false, error: failures.join(" | ") };
  return { ok: true, output: { results, failures } };
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
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
  tenantId: string,
): Promise<NodeOutcome | null> {
  if (!ref.startsWith("cap.dataforseo_")) return null;

  const { getSelectedProperty } = await import("./search-console.server");

  try {
    const property = await getSelectedProperty(client, tenantId);
    const target = (property ?? "")
      .replace(/^sc-domain:/, "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!target) return { ok: false, error: "No owned property is selected to observe." };

    if (ref === "cap.dataforseo_labs") {
      const { suggestKeywords } = await import("./dataforseo/keywords.server");
      const result = await suggestKeywords(client, tenantId, target, {
        runId,
        key: "dfs-keyword-discovery",
      });
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
          missingEvidence: evidence.missingEvidence,
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
            "No approved keywords to observe. Run keyword discovery and approve a set in the Action Center first: AOOS will not queue a keyword nobody chose.",
        };
      }
      const result = await queueSerpTasks(client, tenantId, keywords, PUBLIC_ORIGIN, {
        runId,
        key: "dfs-serp-observe",
      });
      return {
        ok: true,
        output: { target, keywords: keywords.length, ...result },
      };
    }

    if (ref === "cap.dataforseo_onpage") {
      const { collectReadyCrawls, startCrawl } = await import("./dataforseo/onpage.server");
      // Harvest before posting. A crawl already paid for and finished is free to
      // read, and collecting it first means the node reports finished evidence
      // on the same pass that queues the next crawl.
      const collected = await collectReadyCrawls(client, tenantId);
      const crawl = await startCrawl(client, tenantId, target, {
        runId,
        key: "dfs-onpage-audit",
      });
      return {
        ok: true,
        output: {
          target,
          costUsd: collected.costUsd + crawl.costUsd,
          queued: crawl.created,
          providerTaskId: crawl.providerTaskId,
          outstanding: collected.outstanding,
          collected: collected.collected,
          stillCrawling: collected.stillCrawling,
        },
      };
    }

    if (ref === "cap.dataforseo_domain_analytics") {
      // Technologies only. whois/overview is defined by its filters and there is
      // no cohort the owned property implies, so it stays operator-driven rather
      // than running here on a filter set nobody chose.
      const { collectDomainTechnologies } = await import("./dataforseo/domain-analytics.server");
      const result = await collectDomainTechnologies(client, tenantId, target, {
        runId,
        key: "dfs-domain-technologies",
      });
      return { ok: true, output: { target, ...result } };
    }

    if (ref === "cap.dataforseo_content_analysis") {
      const { searchBrandMentions } = await import("./dataforseo/content-analysis.server");
      // The domain label without its TLD, the same brand derivation
      // backlink-evidence.server.ts already uses to classify anchors. Nothing
      // else in AOOS records a brand name, so inventing one is not an option.
      //
      // Fixed 2026-08-31: this dropped the TLD but left a leading "www." on
      // the label, so "www.trumove.com" derived the brand term "www.trumove"
      // rather than "trumove" -- every mention search for a www-form target
      // was searching for the wrong word. Strip it before the TLD comes off.
      const brand = target.replace(/^www\./, "").replace(/\.[a-z.]+$/, "");
      if (!brand) return { ok: false, error: `No brand term can be derived from "${target}".` };
      const result = await searchBrandMentions(client, tenantId, brand, {
        runId,
        key: "dfs-brand-mentions",
      });
      return {
        ok: true,
        output: {
          target,
          brand,
          costUsd: result.costUsd,
          mentions: result.mentions.length,
          totalCount: result.totalCount,
          unparsed: result.unparsed,
        },
      };
    }

    // A cap.dataforseo_* key with no branch above is unhandled: fall through to
    // the caller's refusal instead of passing it off as an observed target.
    return null;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Re-reads the stored DataForSEO Backlinks snapshots and files the three
 * backlink findings (`backlink-rules.server.ts`). Costs nothing: no provider
 * is called.
 */
async function runBacklinkFindingsNode(
  client: Client,
  ref: string,
  tenantId: string,
): Promise<NodeOutcome | null> {
  if (ref !== "backlinks.findings") return null;
  try {
    const { evaluateBacklinkFindings } = await import("./backlink-rules.server");
    const result = await evaluateBacklinkFindings(client, tenantId);
    return { ok: true, output: { ...result, costUsd: 0 } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Rebuilds the competitor set from observed SERP results. Costs nothing: it
 * re-reads stored evidence and never calls the provider.
 */
async function runSerpCompetitorNode(
  client: Client,
  ref: string,
  tenantId: string,
): Promise<NodeOutcome | null> {
  if (
    ref !== "serp.competitors" &&
    ref !== "serp.competitor_intelligence" &&
    ref !== "competitor.page_observation" &&
    ref !== "serp.targeting" &&
    ref !== "discovery.competition_findings"
  ) {
    return null;
  }
  try {
    const { getSelectedProperty } = await import("./search-console.server");
    const { deriveCompetitorsFromSerp } = await import("./dataforseo/competitors.server");

    if (ref === "serp.targeting") {
      const { runTargetingPass } = await import("./dataforseo/targeting-rules.server");
      const result = await runTargetingPass(client, tenantId);
      return { ok: true, output: { ...result, costUsd: 0 } };
    }

    if (ref === "discovery.competition_findings") {
      const { runCompetitorDiscoveryFindings } =
        await import("./dataforseo/discovery-findings.server");
      const result = await runCompetitorDiscoveryFindings(client, tenantId);
      return { ok: true, output: { ...result, costUsd: 0 } };
    }

    const property = await getSelectedProperty(client, tenantId);
    const own = (property ?? "")
      .replace(/^sc-domain:/, "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!own) return { ok: false, error: "No owned property is selected." };

    if (ref === "serp.competitor_intelligence") {
      const { buildCompetitorProfiles } =
        await import("./dataforseo/competitor-intelligence.server");
      const { result } = await buildCompetitorProfiles(client, tenantId, own);
      return { ok: true, output: { ...result } };
    }

    if (ref === "competitor.page_observation") {
      const { readShortlistedProfiles } =
        await import("./dataforseo/competitor-intelligence.server");
      const { inspectShortlistPages } = await import("./dataforseo/competitor-pages.server");
      const profiles = await readShortlistedProfiles(client, tenantId);
      if (profiles.length === 0) {
        return {
          ok: true,
          output: {
            noChange: true,
            reason: "No shortlisted competitor to inspect.",
          },
        };
      }
      const evidence = await inspectShortlistPages(client, tenantId, profiles);
      return { ok: true, output: { ...evidence } };
    }

    const result = await deriveCompetitorsFromSerp(client, tenantId, own);
    return { ok: true, output: { ...result } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Site-audit rule pass: re-reads the tenant's newest stored OnPage crawl
 * snapshots and files evidence-backed findings from them. Costs nothing and
 * calls no provider, the same shape as `serp.targeting` above.
 */
/**
 * The nightly live-site read (CODE-87). Free: it fetches the tenant's own
 * pages directly. The selected Search Console property names the origin, as
 * the Search Console nodes do; without one there is no site to read.
 */
async function runSiteWatchNode(
  client: Client,
  ref: string,
  tenantId: string,
): Promise<NodeOutcome | null> {
  if (ref !== "site.watch") return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getSelectedProperty } = await import("./search-console.server");
  const { readLiveSite } = await import("./site-watch.server");
  const property = await getSelectedProperty(client, tenantId);
  if (!property) {
    return {
      ok: false,
      error: "No Search Console property is selected, so there is no site to read.",
    };
  }
  try {
    const result = await readLiveSite(supabaseAdmin, { tenantId, property, actorId: null });
    return { ok: true, output: { ...result } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runSiteAuditNode(
  client: Client,
  ref: string,
  tenantId: string,
): Promise<NodeOutcome | null> {
  if (ref !== "site-audit.rules") return null;
  try {
    const { evaluateOnPageSnapshots } = await import("./onpage-rules.server");
    const result = await evaluateOnPageSnapshots(client, tenantId);
    if (result.noSnapshots) {
      return {
        ok: true,
        output: { noChange: true, reason: "No OnPage crawl has been collected yet." },
      };
    }
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
  tenantId: string,
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
    // Fail closed on the registry state. cap.serpapi_ads_transparency is the
    // single exception: its only action is the free account probe, which is
    // exactly how a pending gate is meant to become reachable. Every other Ads
    // node stays unrunnable by the normal runner until it is promoted, so a
    // bulk workflow can never quietly start spending on a pending stage.
    if (ref !== "cap.serpapi_ads_transparency") {
      const { data: capability, error: capabilityError } = await client
        .from("capabilities")
        .select("integration_state")
        .eq("key", ref)
        .maybeSingle();
      if (capabilityError) {
        return {
          ok: false,
          error: `Capability state read failed: ${capabilityError.message}`,
        };
      }
      if (!capability) {
        return { ok: false, error: `Capability ${ref} is not registered.` };
      }
      if (capability.integration_state === "pending") {
        return {
          ok: false,
          error: `${ref} is still pending. Validate the provider gate and complete operator review before running this stage.`,
        };
      }
    }

    if (ref === "ads.vendor_network_analysis") {
      const { analyzeVendorNetwork } = await import("./serpapi/network.server");
      const result = await analyzeVendorNetwork(client, tenantId);
      return { ok: true, output: { ...result } as Record<string, unknown> };
    }

    if (ref === "ads.landing_page_intelligence") {
      const { observeAdDestinations } = await import("./serpapi/landing-pages.server");
      const result = await observeAdDestinations(client, tenantId);
      if (result.destinations === 0) {
        return {
          ok: true,
          output: {
            noChange: true,
            reason: "No stored ad destination to observe yet.",
          },
        };
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
      const result = await resolveVendorAdvertisers(client, tenantId, {
        runId,
      });
      return { ok: true, output: { ...result } as Record<string, unknown> };
    }

    if (ref === "ads.creative_intelligence") {
      const { ingestAdvertiserCreatives } = await import("./serpapi/creatives.server");
      const result = await ingestAdvertiserCreatives(client, tenantId, {
        runId,
      });
      if (result.advertisers === 0) {
        return {
          ok: true,
          output: {
            noChange: true,
            reason: "No confirmed advertiser yet. Resolve and confirm a vendor advertiser first.",
          },
        };
      }
      return { ok: true, output: { ...result } };
    }

    if (ref === "ads.live_serp_observation") {
      const { observeLivePaidSerps } = await import("./serpapi/live-serp.server");
      const result = await observeLivePaidSerps(client, tenantId, { runId });
      if (result.keywords === 0) {
        return {
          ok: false,
          error: "No approved keywords to observe on the paid SERP.",
        };
      }
      return { ok: true, output: { ...result } as Record<string, unknown> };
    }

    const { checkSerpApiAccount, recordSerpApiAccountStatus } =
      await import("./serpapi/account.server");
    const account = await checkSerpApiAccount();
    await recordSerpApiAccountStatus(client, account);
    if (!account.valid) {
      return {
        ok: false,
        error: account.error ?? "The SerpApi account is not usable.",
      };
    }
    return {
      ok: true,
      output: {
        valid: true,
        planName: account.planName,
        searchesLeft: account.searchesLeft,
        searchesPerMonth: account.searchesPerMonth,
        checkedAt: account.checkedAt,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
