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

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function group(summary: Record<string, unknown> | null, key: string): Record<string, unknown> {
  const value = summary?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Totals are computed in the database. The previous version downloaded up to
 * two thousand raw ledger rows and summed them in the browser, which locked
 * the tab on a workspace with real request history.
 */
export const getProviderSpend = createServerFn({ method: "GET" }).handler(async () => {
  const empty = {
    providers: [] as ProviderSpendRow[],
    budget: null as SpendBudget | null,
    serpApiCredits: 0,
  };

  const ctx = await context();
  if (!ctx) return empty;

  const { data, error } = await ctx.db.rpc("provider_spend_summary", {
    _tenant_id: ctx.tenantId,
  });
  if (error) throw new Error(error.message);

  const summary =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;

  const dfs = group(summary, "dataforseo");
  const serp = group(summary, "serpapi");
  const budgetRow = summary?.["budget"];
  const budget =
    budgetRow && typeof budgetRow === "object" && !Array.isArray(budgetRow)
      ? (budgetRow as Record<string, unknown>)
      : null;

  const providers: ProviderSpendRow[] = [
    {
      provider: "DataForSEO",
      requests: num(dfs["requests"]),
      failures: num(dfs["failures"]),
      costUsd: num(dfs["costUsd"]),
      lastRequestAt: typeof dfs["lastRequestAt"] === "string" ? dfs["lastRequestAt"] : null,
    },
    {
      provider: "Google Ads Transparency (SerpAPI)",
      requests: num(serp["requests"]),
      failures: num(serp["failures"]),
      costUsd: 0,
      lastRequestAt: typeof serp["lastRequestAt"] === "string" ? serp["lastRequestAt"] : null,
    },
  ];

  return {
    providers,
    budget: budget
      ? ({
          periodMonth: String(budget["periodMonth"] ?? ""),
          ceilingUsd: num(budget["ceilingUsd"]),
          spentUsd: num(budget["spentUsd"]),
          hardStop: Boolean(budget["hardStop"]),
        } satisfies SpendBudget)
      : null,
    serpApiCredits: num(serp["credits"]),
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
    (profiles.data ?? []).map((row) => [
      row.id,
      row as { email: string | null; display_name: string | null },
    ]),
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
