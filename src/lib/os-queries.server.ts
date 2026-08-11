import { rows, unwrap } from "./os.server";
import { createRequestClient, resolveTenantId } from "./tenant.server";

export type Overview = {
  counts: Record<string, number>;
  activity: Awaited<ReturnType<typeof fetchActivity>>;
};

/**
 * Every read runs as the calling operator, so row level security decides which
 * client workspace is visible. The tenant filter below keeps administrators,
 * who can see every tenant, pinned to the workspace they are working in.
 */
async function scope() {
  const { db, authenticated } = createRequestClient();
  const tenantId = authenticated ? await resolveTenantId(db) : null;
  return { db, tenantId, ready: authenticated && tenantId !== null };
}

export async function fetchInbox() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return [];
  return rows(
    await db
      .from("inbox_items")
      .select("*")
      .eq("tenant_id", tenantId!)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

export async function fetchActivity(limit = 40) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return [];
  return rows(
    await db
      .from("activity_events")
      .select("*")
      .eq("tenant_id", tenantId!)
      .order("occurred_at", { ascending: false })
      .limit(limit),
  );
}

export async function fetchAssets() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return [];
  return rows(await db.from("assets").select("*").eq("tenant_id", tenantId!).order("kind").order("name"));
}

export async function fetchAsset(id: string) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { asset: null, activity: [] };
  const asset = unwrap(
    await db.from("assets").select("*").eq("id", id).eq("tenant_id", tenantId!).maybeSingle(),
  );
  const activity = rows(
    await db
      .from("activity_events")
      .select("*")
      .eq("subject_id", id)
      .eq("tenant_id", tenantId!)
      .order("occurred_at", { ascending: false })
      .limit(20),
  );
  return { asset, activity };
}

export async function fetchCapabilities() {
  const { db, ready } = await scope();
  if (!ready) return [];
  return rows(await db.from("capabilities").select("*").order("kind").order("name"));
}

export async function fetchCapability(id: string) {
  const { db, ready } = await scope();
  if (!ready) return { capability: null, agents: [] };
  const capability = unwrap(await db.from("capabilities").select("*").eq("id", id).maybeSingle());
  const agents = rows(
    await db.from("agent_capabilities").select("grant_scope, agents(id, name, key)").eq("capability_id", id),
  );
  return { capability, agents };
}

export async function fetchKnowledge() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { collections: [], entries: [] };
  const collections = rows(
    await db
      .from("knowledge_collections")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("kind"),
  );
  const entries = rows(
    await db
      .from("knowledge_entries")
      .select("*")
      .eq("tenant_id", tenantId!)
      .order("created_at", { ascending: false }),
  );
  return { collections, entries };
}

export async function fetchKnowledgeCollection(id: string) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { collection: null, entries: [] };
  const collection = unwrap(await db.from("knowledge_collections").select("*").eq("id", id).maybeSingle());
  const entries = rows(
    await db
      .from("knowledge_entries")
      .select("*")
      .eq("collection_id", id)
      .eq("tenant_id", tenantId!)
      .order("created_at", { ascending: false }),
  );
  return { collection, entries };
}

export async function fetchAgents() {
  const { db, ready } = await scope();
  if (!ready) return [];
  return rows(await db.from("agents").select("*, workflows(id, name, key)").order("name"));
}

export async function fetchAgent(id: string) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { agent: null, capabilities: [], knowledge: [], activity: [] };
  const agent = unwrap(
    await db.from("agents").select("*, workflows(id, name, key)").eq("id", id).maybeSingle(),
  );
  const capabilities = rows(
    await db
      .from("agent_capabilities")
      .select("grant_scope, capabilities(id, key, name, kind, integration_state)")
      .eq("agent_id", id),
  );
  const knowledge = rows(
    await db
      .from("agent_knowledge")
      .select("access, knowledge_collections(id, key, name, kind)")
      .eq("agent_id", id),
  );
  const activity = rows(
    await db
      .from("activity_events")
      .select("*")
      .eq("subject_id", id)
      .eq("tenant_id", tenantId!)
      .order("occurred_at", { ascending: false })
      .limit(20),
  );
  return { agent, capabilities, knowledge, activity };
}

export async function fetchWorkflows() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { workflows: [], runs: [] };
  const workflows = rows(await db.from("workflows").select("*").order("name"));
  const runs = rows(
    await db
      .from("workflow_runs")
      .select("*")
      .eq("tenant_id", tenantId!)
      .order("created_at", { ascending: false })
      .limit(50),
  );
  return { workflows, runs };
}

export async function fetchWorkflow(id: string) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { workflow: null, runs: [] };
  const workflow = unwrap(await db.from("workflows").select("*").eq("id", id).maybeSingle());
  const runs = rows(
    await db
      .from("workflow_runs")
      .select("*, workflow_steps(*)")
      .eq("workflow_id", id)
      .eq("tenant_id", tenantId!)
      .order("created_at", { ascending: false })
      .limit(20),
  );
  return { workflow, runs };
}

export async function fetchRecommendations() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return [];
  return rows(
    await db
      .from("recommendations")
      .select("*")
      .eq("tenant_id", tenantId!)
      .order("created_at", { ascending: false }),
  );
}

export async function fetchRecommendation(id: string) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { recommendation: null, dependencies: [] };
  const recommendation = unwrap(
    await db.from("recommendations").select("*").eq("id", id).eq("tenant_id", tenantId!).maybeSingle(),
  );
  const dependencies = rows(
    await db
      .from("recommendation_dependencies")
      .select(
        "depends_on_recommendation_id, recommendations!recommendation_dependencies_depends_on_recommendation_id_fkey(id, title, state)",
      )
      .eq("recommendation_id", id),
  );
  return { recommendation, dependencies };
}

export async function fetchSchedules() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { schedules: [], dependencies: [] };
  const schedules = rows(
    await db.from("schedules").select("*").or(`tenant_id.eq.${tenantId},tenant_id.is.null`).order("cron"),
  );
  const dependencies = rows(await db.from("schedule_dependencies").select("*"));
  return { schedules, dependencies };
}

export async function fetchSchedule(id: string) {
  const { db, ready } = await scope();
  if (!ready) return { schedule: null, dependencies: [] };
  const schedule = unwrap(await db.from("schedules").select("*").eq("id", id).maybeSingle());
  const dependencies = rows(
    await db
      .from("schedule_dependencies")
      .select(
        "condition, depends_on_schedule_id, schedules!schedule_dependencies_depends_on_schedule_id_fkey(id, name, key, last_state)",
      )
      .eq("schedule_id", id),
  );
  return { schedule, dependencies };
}

export type CapabilitySummary = {
  id: string;
  key: string;
  name: string;
  integration_state: string;
  health: string;
};

export type RunSummary = {
  id: string;
  state: string;
  trigger_source: string;
  created_at: string;
  duration_ms: number | null;
  error: string | null;
  workflow_id: string | null;
  context: unknown;
  workflows: { id: string; key: string; name: string } | null;
};

export type QuickActionCounts = {
  openInbox: number;
  pendingCompetitors: number;
  pendingAdvertisers: number;
  failedRuns: number;
};

export async function fetchOverview() {
  const { db, tenantId, ready } = await scope();

  const counts: Record<string, number> = {
    assets: 0,
    capabilities: 0,
    knowledge_entries: 0,
    agents: 0,
    workflows: 0,
    recommendations: 0,
    schedules: 0,
    inbox_items: 0,
  };

  const empty = {
    ready: false,
    counts,
    capabilities: [] as CapabilitySummary[],
    runs: [] as RunSummary[],
    activity: [] as Awaited<ReturnType<typeof fetchActivity>>,
    evidence: {
      spentUsd: 0,
      ceilingUsd: 0,
      providerRequests: 0,
      dataforseoSnapshots: 0,
      searchConsoleSnapshots: 0,
      lastDataforseoAt: null as string | null,
      lastSearchConsoleAt: null as string | null,
      pendingKeywordCandidates: 0,
      trackedKeywords: 0,
      competitorCandidates: 0,
      trackedCompetitors: 0,
    },
    pendingApprovals: 0,
  };

  if (!ready) return empty;

  // One consolidated read. The database function is SECURITY INVOKER, so row
  // level security still answers as the calling operator; the page simply stops
  // paying twenty separate HTTP round trips for the same numbers.
  const { data, error } = await db.rpc("command_center_overview", { _tenant_id: tenantId! });
  if (error) {
    throw new Error(`Command Center read failed: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Command Center read returned a malformed payload.");
  }

  const payload = data as unknown as {
    counts: Record<string, number>;
    capabilities: CapabilitySummary[];
    runs: RunSummary[];
    activity: Awaited<ReturnType<typeof fetchActivity>>;
    evidence: typeof empty.evidence;
    pendingApprovals: number;
  };

  if (!payload.counts || typeof payload.counts !== "object" || !payload.evidence) {
    throw new Error("Command Center read returned a malformed payload.");
  }


  for (const key of Object.keys(counts)) counts[key] = Number(payload.counts?.[key] ?? 0);

  return {
    ready: true,
    counts,
    capabilities: payload.capabilities ?? [],
    runs: payload.runs ?? [],
    activity: payload.activity ?? [],
    evidence: {
      ...empty.evidence,
      ...payload.evidence,
      spentUsd: Number(payload.evidence?.spentUsd ?? 0),
      ceilingUsd: Number(payload.evidence?.ceilingUsd ?? 0),
    },
    pendingApprovals: Number(payload.pendingApprovals ?? 0),
  };
}

