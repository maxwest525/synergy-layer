import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "../os.server";

type Client = SupabaseClient<Database>;

/**
 * Spend controls for every model call, the same shape as
 * `dataforseo/budget.server.ts`'s `BUDGET_CONFIG` -- kept as its own table and
 * module rather than shared, because a metered API billed per request and a
 * model billed per token are different enough that sharing one schema would
 * add indirection, not save it.
 */
export const AI_BUDGET_CONFIG = {
  defaultCeilingUsd: 300,
  alertThresholds: [50, 75, 90, 100] as const,
  hardStop: true,
} satisfies { defaultCeilingUsd: number; alertThresholds: readonly number[]; hardStop: boolean };

export class AiBudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBudgetExceeded";
  }
}

export type AiBudgetState = {
  id: string;
  periodMonth: string;
  ceilingUsd: number;
  spentUsd: number;
  hardStop: boolean;
  alertsFired: number[];
};

function currentMonth(now = new Date()): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** One budget row per tenant per month, created on first use. */
export async function getAiBudget(client: Client, tenantId: string): Promise<AiBudgetState> {
  const periodMonth = currentMonth();
  const { data, error } = await client
    .from("ai_gateway_budgets")
    .select("id, period_month, ceiling_usd, spent_usd, hard_stop, alerts_fired")
    .eq("tenant_id", tenantId)
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (data) {
    return {
      id: data.id,
      periodMonth: data.period_month,
      ceilingUsd: Number(data.ceiling_usd),
      spentUsd: Number(data.spent_usd),
      hardStop: data.hard_stop,
      alertsFired: (data.alerts_fired as number[] | null) ?? [],
    };
  }

  const { data: created, error: insertError } = await client
    .from("ai_gateway_budgets")
    .insert({
      tenant_id: tenantId,
      period_month: periodMonth,
      ceiling_usd: AI_BUDGET_CONFIG.defaultCeilingUsd,
      hard_stop: AI_BUDGET_CONFIG.hardStop,
    })
    .select("id, period_month, ceiling_usd, spent_usd, hard_stop, alerts_fired")
    .single();
  if (insertError) throw new Error(insertError.message);

  return {
    id: created.id,
    periodMonth: created.period_month,
    ceilingUsd: Number(created.ceiling_usd),
    spentUsd: Number(created.spent_usd),
    hardStop: created.hard_stop,
    alertsFired: [],
  };
}

/**
 * Pre-call guard. A call is refused when the ceiling is already reached, or
 * when its worst-case estimate would cross it and hard stop is on.
 *
 * `estimatedUsd` is necessarily a guess -- the real cost is only known once
 * the response reports actual token usage, which `recordSpend` accounts for
 * afterward. Overestimating here costs nothing but a slightly earlier refusal;
 * underestimating lets a call through that `recordSpend` then reports as
 * having pushed the ledger past the ceiling, which the next call's guard
 * catches.
 */
export async function assertAiBudget(
  client: Client,
  tenantId: string,
  estimatedUsd: number,
): Promise<AiBudgetState> {
  const budget = await getAiBudget(client, tenantId);
  if (!budget.hardStop) return budget;

  if (budget.spentUsd + estimatedUsd > budget.ceilingUsd) {
    throw new AiBudgetExceeded(
      `AI model spend ceiling reached for ${budget.periodMonth.slice(0, 7)}: $${budget.spentUsd.toFixed(
        4,
      )} of $${budget.ceilingUsd.toFixed(2)} spent, this call would add about $${estimatedUsd.toFixed(4)}.`,
    );
  }
  return budget;
}

/** Post-call accounting. Alerts fire once per threshold per month. */
export async function recordAiSpend(
  client: Client,
  tenantId: string,
  costUsd: number,
  context: {
    surface: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    priced: boolean;
  },
): Promise<AiBudgetState> {
  const budget = await getAiBudget(client, tenantId);
  const spent = budget.spentUsd + costUsd;
  const percent = budget.ceilingUsd > 0 ? (spent / budget.ceilingUsd) * 100 : 0;

  const crossed = AI_BUDGET_CONFIG.alertThresholds.filter(
    (threshold) => percent >= threshold && !budget.alertsFired.includes(threshold),
  );
  const alertsFired = [...budget.alertsFired, ...crossed];

  const { error } = await client
    .from("ai_gateway_budgets")
    .update({ spent_usd: spent, alerts_fired: alertsFired as never })
    .eq("id", budget.id);
  if (error) throw new Error(error.message);

  const { error: requestError } = await client.from("ai_gateway_requests").insert({
    tenant_id: tenantId,
    surface: context.surface,
    model: context.model,
    input_tokens: context.inputTokens,
    output_tokens: context.outputTokens,
    cost_usd: costUsd,
    priced: context.priced,
  });
  if (requestError) throw new Error(requestError.message);

  for (const threshold of crossed) {
    await fileInboxItem(client, {
      lane: threshold >= 100 ? "needs_attention" : "fyi",
      sourceModule: "ai_gateway",
      title: `AI model spend at ${threshold}% of the monthly ceiling`,
      summary: `$${spent.toFixed(4)} of $${budget.ceilingUsd.toFixed(2)} used this month. Last call: ${
        context.surface
      } (${context.model}).`,
      priority: threshold >= 90 ? 1 : 3,
      tenantId,
    });
    await logActivity(client, {
      verb: "ai_gateway.budget_threshold_crossed",
      subjectKind: "capability",
      summary: `AI model spend crossed ${threshold}% of the $${budget.ceilingUsd.toFixed(2)} monthly ceiling.`,
      payload: { threshold, spentUsd: spent, ceilingUsd: budget.ceilingUsd, ...context },
      tenantId,
    });
  }

  return { ...budget, spentUsd: spent, alertsFired };
}
