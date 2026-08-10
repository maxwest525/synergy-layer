import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "../os.server";

type Client = SupabaseClient<Database>;

/** Spend controls are typed config, never magic numbers scattered in callers. */
export const BUDGET_CONFIG = {
  defaultCeilingUsd: 300,
  alertThresholds: [50, 75, 90, 100] as const,
  hardStop: true,
} satisfies { defaultCeilingUsd: number; alertThresholds: readonly number[]; hardStop: boolean };

export class BudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceeded";
  }
}

export type BudgetState = {
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
export async function getBudget(client: Client, tenantId: string): Promise<BudgetState> {
  const periodMonth = currentMonth();
  const { data, error } = await client
    .from("dataforseo_budgets")
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
    .from("dataforseo_budgets")
    .insert({
      tenant_id: tenantId,
      period_month: periodMonth,
      ceiling_usd: BUDGET_CONFIG.defaultCeilingUsd,
      hard_stop: BUDGET_CONFIG.hardStop,
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
 */
export async function assertBudget(
  client: Client,
  tenantId: string,
  estimatedUsd: number,
): Promise<BudgetState> {
  const budget = await getBudget(client, tenantId);
  if (!budget.hardStop) return budget;

  if (budget.spentUsd + estimatedUsd > budget.ceilingUsd) {
    throw new BudgetExceeded(
      `DataForSEO monthly ceiling reached for ${budget.periodMonth.slice(0, 7)}: $${budget.spentUsd.toFixed(
        4,
      )} of $${budget.ceilingUsd.toFixed(2)} spent, this call would add about $${estimatedUsd.toFixed(4)}.`,
    );
  }
  return budget;
}

/** Post-call accounting. Alerts fire once per threshold per month. */
export async function recordSpend(
  client: Client,
  tenantId: string,
  costUsd: number,
  context: { capabilityKey: string; endpoint: string },
): Promise<BudgetState> {
  const budget = await getBudget(client, tenantId);
  const spent = budget.spentUsd + costUsd;
  const percent = budget.ceilingUsd > 0 ? (spent / budget.ceilingUsd) * 100 : 0;

  const crossed = BUDGET_CONFIG.alertThresholds.filter(
    (threshold) => percent >= threshold && !budget.alertsFired.includes(threshold),
  );
  const alertsFired = [...budget.alertsFired, ...crossed];

  const { error } = await client
    .from("dataforseo_budgets")
    .update({ spent_usd: spent, alerts_fired: alertsFired as never })
    .eq("id", budget.id);
  if (error) throw new Error(error.message);

  for (const threshold of crossed) {
    await fileInboxItem(client, {
      lane: threshold >= 100 ? "needs_attention" : "fyi",
      sourceModule: "dataforseo",
      title: `DataForSEO spend at ${threshold}% of the monthly ceiling`,
      summary: `$${spent.toFixed(4)} of $${budget.ceilingUsd.toFixed(2)} used this month. Last call: ${
        context.capabilityKey
      } ${context.endpoint}.`,
      priority: threshold >= 90 ? 1 : 3,
      tenantId,
    });
    await logActivity(client, {
      verb: "capability.budget_threshold_crossed",
      subjectKind: "capability",
      summary: `DataForSEO spend crossed ${threshold}% of the $${budget.ceilingUsd.toFixed(2)} monthly ceiling.`,
      payload: { threshold, spentUsd: spent, ceilingUsd: budget.ceilingUsd, ...context },
      tenantId,
    });
  }

  return { ...budget, spentUsd: spent, alertsFired };
}
