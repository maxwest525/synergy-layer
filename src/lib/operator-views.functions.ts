import { createServerFn } from "@tanstack/react-start";

/**
 * Read-only operator views for data the OS already stores but never surfaced
 * in navigation: proposed page changes, authority findings, provider spend,
 * and who is authorized on the active tenant.
 */

const emptyChanges = { changeRequests: [] as ChangeRequestRow[] };

export type ChangeRequestRow = {
  id: string;
  title: string;
  state: string;
  targetUrl: string | null;
  proposalType: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type AuthorityFindingRow = {
  id: string;
  targetUrl: string | null;
  ruleKey: string;
  queryClass: string | null;
  severity: string;
  confidence: string | null;
  missingEvidence: string[];
  detectedAt: string;
};

export type ProviderSpendRow = {
  provider: string;
  requests: number;
  failures: number;
  costUsd: number;
  lastRequestAt: string | null;
};

export type OperatorRow = {
  userId: string;
  role: string;
  email: string | null;
  displayName: string | null;
  since: string;
};

async function context() {
  const { createRequestClient, resolveTenantId } = await import("./tenant.server");
  const { db, authenticated } = createRequestClient();
  if (!authenticated) return null;
  const tenantId = await resolveTenantId(db);
  if (!tenantId) return null;
  return { db, tenantId };
}

export const listChangeRequests = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await context();
  if (!ctx) return emptyChanges;
  const { data, error } = await ctx.db
    .from("change_requests")
    .select("id, title, state, target_url, proposal_type, created_at, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return {
    changeRequests: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      state: row.state,
      targetUrl: row.target_url ?? null,
      proposalType: row.proposal_type ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? null,
    })) satisfies ChangeRequestRow[],
  };
});

export const listAuthorityFindings = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await context();
  if (!ctx) return { findings: [] as AuthorityFindingRow[] };
  const { data, error } = await ctx.db
    .from("authority_findings")
    .select(
      "id, target_url, rule_key, query_class, severity, confidence, missing_evidence, detected_at",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("detected_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return {
    findings: (data ?? []).map((row) => ({
      id: row.id,
      targetUrl: row.target_url ?? null,
      ruleKey: row.rule_key,
      queryClass: row.query_class ?? null,
      severity: row.severity,
      confidence: row.confidence ?? null,
      missingEvidence: (row.missing_evidence ?? []) as string[],
      detectedAt: row.detected_at,
    })) satisfies AuthorityFindingRow[],
  };
});

export type SpendBudget = {
  periodMonth: string;
  ceilingUsd: number;
  spentUsd: number;
  hardStop: boolean;
};

export const getProviderSpend = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await context();
  if (!ctx)
    return {
      providers: [] as ProviderSpendRow[],
      budget: null as SpendBudget | null,
      serpApiCredits: 0,
    };

  const [dfs, serp, budget] = await Promise.all([
    ctx.db
      .from("dataforseo_requests")
      .select("cost_usd, outcome, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(1000),
    ctx.db
      .from("serpapi_requests")
      .select("charged_credits, state, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(1000),
    ctx.db
      .from("dataforseo_budgets")
      .select("period_month, ceiling_usd, spent_usd, hard_stop")
      .eq("tenant_id", ctx.tenantId)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (dfs.error) throw new Error(dfs.error.message);
  if (serp.error) throw new Error(serp.error.message);

  const dfsRows = dfs.data ?? [];
  const serpRows = serp.data ?? [];

  const providers: ProviderSpendRow[] = [
    {
      provider: "DataForSEO",
      requests: dfsRows.length,
      failures: dfsRows.filter((row) => row.outcome !== "success").length,
      costUsd: dfsRows.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0),
      lastRequestAt: dfsRows[0]?.created_at ?? null,
    },
    {
      provider: "Google Ads Transparency (SerpAPI)",
      requests: serpRows.length,
      failures: serpRows.filter((row) => row.state !== "succeeded").length,
      costUsd: 0,
      lastRequestAt: serpRows[0]?.created_at ?? null,
    },
  ];

  return {
    providers,
    budget:
      budget.error || !budget.data
        ? null
        : ({
            periodMonth: String(budget.data.period_month),
            ceilingUsd: Number(budget.data.ceiling_usd ?? 0),
            spentUsd: Number(budget.data.spent_usd ?? 0),
            hardStop: Boolean(budget.data.hard_stop),
          } satisfies SpendBudget),
    serpApiCredits: serpRows.reduce((sum, row) => sum + Number(row.charged_credits ?? 0), 0),
  };
});

export const listAuthorizedOperators = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await context();
  if (!ctx) return { operators: [] as OperatorRow[] };
  const { data, error } = await ctx.db
    .from("tenant_members")
    .select("user_id, role, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const members = data ?? [];
  const ids = members.map((row) => row.user_id);
  const profiles = ids.length
    ? await ctx.db.from("profiles").select("id, email, display_name").in("id", ids)
    : { data: [], error: null };
  const byId = new Map(
    (profiles.data ?? []).map((row) => [row.id, row as { email: string | null; display_name: string | null }]),
  );
  return {
    operators: members.map((row) => ({
      userId: row.user_id,
      role: row.role,
      email: byId.get(row.user_id)?.email ?? null,
      displayName: byId.get(row.user_id)?.display_name ?? null,
      since: row.created_at,
    })) satisfies OperatorRow[],
  };
});
