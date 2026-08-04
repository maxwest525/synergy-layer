import { createPublicServerClient, rows, unwrap } from "./os.server";

export type Overview = {
  counts: Record<string, number>;
  activity: Awaited<ReturnType<typeof fetchActivity>>;
};

export async function fetchInbox() {
  const db = createPublicServerClient();
  return rows(
    await db
      .from("inbox_items")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

export async function fetchActivity(limit = 40) {
  const db = createPublicServerClient();
  return rows(
    await db.from("activity_events").select("*").order("occurred_at", { ascending: false }).limit(limit),
  );
}

export async function fetchAssets() {
  const db = createPublicServerClient();
  return rows(await db.from("assets").select("*").order("kind").order("name"));
}

export async function fetchAsset(id: string) {
  const db = createPublicServerClient();
  const asset = unwrap(await db.from("assets").select("*").eq("id", id).maybeSingle());
  const activity = rows(
    await db
      .from("activity_events")
      .select("*")
      .eq("subject_id", id)
      .order("occurred_at", { ascending: false })
      .limit(20),
  );
  return { asset, activity };
}

export async function fetchCapabilities() {
  const db = createPublicServerClient();
  return rows(await db.from("capabilities").select("*").order("kind").order("name"));
}

export async function fetchCapability(id: string) {
  const db = createPublicServerClient();
  const capability = unwrap(await db.from("capabilities").select("*").eq("id", id).maybeSingle());
  const agents = rows(
    await db.from("agent_capabilities").select("grant_scope, agents(id, name, key)").eq("capability_id", id),
  );
  return { capability, agents };
}

export async function fetchKnowledge() {
  const db = createPublicServerClient();
  const collections = rows(await db.from("knowledge_collections").select("*").order("kind"));
  const entries = rows(
    await db.from("knowledge_entries").select("*").order("created_at", { ascending: false }),
  );
  return { collections, entries };
}

export async function fetchKnowledgeCollection(id: string) {
  const db = createPublicServerClient();
  const collection = unwrap(await db.from("knowledge_collections").select("*").eq("id", id).maybeSingle());
  const entries = rows(
    await db
      .from("knowledge_entries")
      .select("*")
      .eq("collection_id", id)
      .order("created_at", { ascending: false }),
  );
  return { collection, entries };
}

export async function fetchAgents() {
  const db = createPublicServerClient();
  return rows(
    await db.from("agents").select("*, workflows(id, name, key)").order("name"),
  );
}

export async function fetchAgent(id: string) {
  const db = createPublicServerClient();
  const agent = unwrap(await db.from("agents").select("*, workflows(id, name, key)").eq("id", id).maybeSingle());
  const capabilities = rows(
    await db.from("agent_capabilities").select("grant_scope, capabilities(id, key, name, kind, integration_state)").eq("agent_id", id),
  );
  const knowledge = rows(
    await db.from("agent_knowledge").select("access, knowledge_collections(id, key, name, kind)").eq("agent_id", id),
  );
  const activity = rows(
    await db
      .from("activity_events")
      .select("*")
      .eq("subject_id", id)
      .order("occurred_at", { ascending: false })
      .limit(20),
  );
  return { agent, capabilities, knowledge, activity };
}

export async function fetchWorkflows() {
  const db = createPublicServerClient();
  const workflows = rows(await db.from("workflows").select("*").order("name"));
  const runs = rows(
    await db.from("workflow_runs").select("*").order("created_at", { ascending: false }).limit(50),
  );
  return { workflows, runs };
}

export async function fetchWorkflow(id: string) {
  const db = createPublicServerClient();
  const workflow = unwrap(await db.from("workflows").select("*").eq("id", id).maybeSingle());
  const runs = rows(
    await db
      .from("workflow_runs")
      .select("*, workflow_steps(*)")
      .eq("workflow_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  );
  return { workflow, runs };
}

export async function fetchRecommendations() {
  const db = createPublicServerClient();
  return rows(
    await db.from("recommendations").select("*").order("created_at", { ascending: false }),
  );
}

export async function fetchRecommendation(id: string) {
  const db = createPublicServerClient();
  const recommendation = unwrap(await db.from("recommendations").select("*").eq("id", id).maybeSingle());
  const dependencies = rows(
    await db
      .from("recommendation_dependencies")
      .select("depends_on_recommendation_id, recommendations!recommendation_dependencies_depends_on_recommendation_id_fkey(id, title, state)")
      .eq("recommendation_id", id),
  );
  return { recommendation, dependencies };
}

export async function fetchSchedules() {
  const db = createPublicServerClient();
  const schedules = rows(await db.from("schedules").select("*").order("cron"));
  const dependencies = rows(await db.from("schedule_dependencies").select("*"));
  return { schedules, dependencies };
}

export async function fetchSchedule(id: string) {
  const db = createPublicServerClient();
  const schedule = unwrap(await db.from("schedules").select("*").eq("id", id).maybeSingle());
  const dependencies = rows(
    await db
      .from("schedule_dependencies")
      .select("condition, depends_on_schedule_id, schedules!schedule_dependencies_depends_on_schedule_id_fkey(id, name, key, last_state)")
      .eq("schedule_id", id),
  );
  return { schedule, dependencies };
}

export async function fetchOverview() {
  const db = createPublicServerClient();
  const tables = [
    "assets",
    "capabilities",
    "knowledge_entries",
    "agents",
    "workflows",
    "recommendations",
    "schedules",
    "inbox_items",
  ] as const;

  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    counts[table] = count ?? 0;
  }

  const capabilities = rows(await db.from("capabilities").select("key, name, integration_state, health"));
  const runs = rows(
    await db.from("workflow_runs").select("state").order("created_at", { ascending: false }).limit(50),
  );

  return { counts, capabilities, runs, activity: await fetchActivity(20) };
}
