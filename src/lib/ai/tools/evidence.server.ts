import { createClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { supabasePublicUrl, supabasePublishableKey } from "@/integrations/supabase/public-config";

type Db = ReturnType<typeof createClient<Database>>;

/**
 * The agent reads exactly what the operator can read. Every query runs through
 * a client carrying the operator's bearer token, so row level security decides
 * visibility and the agent can never see another tenant's evidence.
 */
function operatorClient(token: string): Db {
  const url = supabasePublicUrl();
  const key = supabasePublishableKey();
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function resolveTenant(db: Db, userId: string): Promise<string | null> {
  const { data } = await db
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

type Ctx = { db: Db; tenantId: string | null };

const NO_TENANT = { error: "No workspace is resolvable for this operator." } as const;

/**
 * Tool results stay compact and always carry the row ids they came from, so a
 * claim in the transcript can be traced back to stored evidence.
 */
export async function buildEvidenceTools(identity: { userId: string; token: string }) {
  const db = operatorClient(identity.token);
  const tenantId = await resolveTenant(db, identity.userId);
  const ctx: Ctx = { db, tenantId };

  return {
    searchConsoleSummary: tool({
      description:
        "Stored Google Search Console snapshots for the workspace: totals per day for the selected property. Use for anything about impressions, clicks, position, or organic search performance.",
      inputSchema: z.object({ days: z.number().describe("How many recent days to read") }),
      execute: async ({ days }) => {
        if (!ctx.tenantId) return NO_TENANT;
        const limit = Math.min(Math.max(Math.round(days) || 28, 1), 180);
        const { data, error } = await ctx.db
          .from("search_console_snapshots")
          .select(
            "id, property, kind, dimensions, period_start_pt, period_end_pt, totals, returned_row_count, collected_at",
          )
          .eq("tenant_id", ctx.tenantId)
          .order("period_end_pt", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    searchConsoleBreakdown: tool({
      description:
        "Stored Search Console snapshots of one kind (for example page or query breakdowns), including their row payload. Use to find which pages or queries are losing.",
      inputSchema: z.object({
        kind: z.string().describe("The snapshot kind, for example 'pages', 'queries', or 'totals'"),
        limit: z.number().describe("How many snapshots to return"),
      }),
      execute: async ({ kind, limit }) => {
        if (!ctx.tenantId) return NO_TENANT;
        const { data, error } = await ctx.db
          .from("search_console_snapshots")
          .select(
            "id, property, kind, dimensions, period_start_pt, period_end_pt, totals, payload, collected_at",
          )
          .eq("tenant_id", ctx.tenantId)
          .eq("kind", kind)
          .order("period_end_pt", { ascending: false })
          .limit(Math.min(Math.max(Math.round(limit) || 3, 1), 10));
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listKeywords: tool({
      description: "Keyword candidates stored for the workspace, with their review state.",
      inputSchema: z.object({
        reviewState: z.string().describe("A review state filter, or 'all'"),
      }),
      execute: async ({ reviewState }) => {
        if (!ctx.tenantId) return NO_TENANT;
        let query = ctx.db
          .from("keyword_candidates")
          .select("id, keyword, review_state, metrics, source, seed, created_at")
          .eq("tenant_id", ctx.tenantId)
          .limit(200);
        if (reviewState && reviewState !== "all") query = query.eq("review_state", reviewState);
        const { data, error } = await query;
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listCompetitors: tool({
      description: "Competitors tracked or proposed for the workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.tenantId) return NO_TENANT;
        const { data, error } = await ctx.db
          .from("tracked_competitors")
          .select("id, domain, label, created_at")
          .eq("tenant_id", ctx.tenantId)
          .limit(100);
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listChangeRequests: tool({
      description:
        "Page change requests and their lifecycle state: what was proposed, approved, executed, and verified.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.tenantId) return NO_TENANT;
        const { data, error } = await ctx.db
          .from("change_requests")
          .select(
            "id, state, title, target_url, rationale, evidence_summary, evidence_limitations, approved_at, applied_at, verified_at, source_commit_url, published_proof_at",
          )
          .eq("tenant_id", ctx.tenantId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listExecutions: tool({
      description:
        "Execution receipts for change requests: what actually ran against the site repository.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.tenantId) return NO_TENANT;
        const { data, error } = await ctx.db
          .from("change_request_executions")
          .select("id, change_request_id, kind, status, created_at, detail")
          .eq("tenant_id", ctx.tenantId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listWorkflowRuns: tool({
      description:
        "Recent workflow runs with their state, so failures can be named rather than guessed.",
      inputSchema: z.object({ state: z.string().describe("A run state filter, or 'all'") }),
      execute: async ({ state }) => {
        if (!ctx.tenantId) return NO_TENANT;
        let query = ctx.db
          .from("workflow_runs")
          .select("id, workflow_id, state, started_at, finished_at, error")
          .eq("tenant_id", ctx.tenantId)
          .order("started_at", { ascending: false })
          .limit(50);
        const runStates = [
          "queued",
          "running",
          "awaiting_approval",
          "succeeded",
          "failed",
          "cancelled",
        ] as const;
        const match = runStates.find((candidate) => candidate === state);
        if (match) query = query.eq("state", match);

        const { data, error } = await query;
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listConnections: tool({
      description:
        "Provider connections with health and integration state. Configured is not connected: only a stored successful read proves a provider works.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.tenantId) return NO_TENANT;
        const { data, error } = await ctx.db
          .from("tenant_connections")
          .select(
            "id, provider, capability_key, health, integration_state, last_checked_at, config",
          )
          .eq("tenant_id", ctx.tenantId)
          .limit(50);
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    listInbox: tool({
      description: "Open inbox items: what is currently waiting on the operator.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.tenantId) return NO_TENANT;
        const { data, error } = await ctx.db
          .from("inbox_items")
          .select("id, lane, title, summary, subject_kind, subject_id, priority, created_at")
          .eq("tenant_id", ctx.tenantId)
          .is("resolved_at", null)
          .limit(100);
        if (error) return { error: error.message };
        return { rowCount: data.length, rows: data };
      },
    }),

    draftProposal: tool({
      description:
        "Draft a page change proposal for the operator to review. This writes nothing and approves nothing: it returns a draft the operator can file as a change request.",
      inputSchema: z.object({
        targetUrl: z.string().describe("The page the change applies to"),
        changeType: z.string().describe("For example title, h1, or schema"),
        proposed: z.string().describe("The exact proposed value"),
        rationale: z.string().describe("Why this change follows from the evidence"),
        evidenceRowIds: z
          .array(z.string())
          .describe("Row ids of the stored evidence this rests on"),
        limitations: z.string().describe("What this evidence cannot tell us"),
      }),
      execute: async (draft) => ({
        status: "draft_only",
        note: "Nothing was written. File this in Decisions to make it a real change request.",
        draft,
      }),
    }),
  };
}
