import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { nextRunAt } from "./cron";
import { fileInboxItem, logActivity } from "./os.server";
import { runWorkflow } from "./workflow-runner.server";

type Client = SupabaseClient<Database>;

export type TickResult = {
  claimed: number;
  blocked: number;
  ran: { schedule: string; state: string }[];
};

export type SchedulerTickOptions = {
  onlyKeys?: string[];
  collectSerpBacklog?: boolean;
  reconcileChangeMeasurements?: boolean;
};

export function requireScheduleAllowlist(options: SchedulerTickOptions): Set<string> {
  if (!options.onlyKeys || options.onlyKeys.length === 0) {
    throw new Error("Scheduler ticks require an explicit schedule allowlist.");
  }
  return new Set(options.onlyKeys);
}

/**
 * Claims every due schedule, respecting dependency edges so chains run in
 * order instead of as isolated jobs.
 */
export async function tickScheduler(
  client: Client,
  now = new Date(),
  options: SchedulerTickOptions = {},
): Promise<TickResult> {
  const allowedKeys = requireScheduleAllowlist(options);
  const { data: schedules, error } = await client.from("schedules").select("*").eq("enabled", true);
  if (error) throw new Error(error.message);

  const { data: dependencies, error: dependencyError } = await client
    .from("schedule_dependencies")
    .select("*");
  if (dependencyError) throw new Error(dependencyError.message);

  const allSchedules = schedules ?? [];
  const selectedSchedules = allSchedules.filter((schedule) => allowedKeys.has(schedule.key));
  const byId = new Map(allSchedules.map((schedule) => [schedule.id, schedule]));
  const result: TickResult = { claimed: 0, blocked: 0, ran: [] };

  for (const schedule of selectedSchedules) {
    const due = schedule.next_run_at === null || new Date(schedule.next_run_at) <= now;
    if (!due) continue;

    const edges = (dependencies ?? []).filter((edge) => edge.schedule_id === schedule.id);
    const blockedBy = edges.find((edge) => {
      const upstream = byId.get(edge.depends_on_schedule_id);
      if (!upstream) return false;
      if (!upstream.last_run_at) return true;
      if (edge.condition === "on_success") return upstream.last_state !== "succeeded";
      return upstream.last_state === null;
    });

    if (blockedBy) {
      result.blocked += 1;
      const upstream = byId.get(blockedBy.depends_on_schedule_id);
      if (upstream?.last_state === "failed") {
        await fileInboxItem(client, {
          lane: "needs_attention",
          sourceModule: "scheduler",
          title: `${schedule.name} is blocked`,
          summary: `Upstream schedule "${upstream.name}" failed, so this step did not start.`,
          priority: 1,
          subjectKind: "schedule",
          subjectId: schedule.id,
          actions: [{ kind: "open" }],
        });
      }
      continue;
    }

    result.claimed += 1;
    const startedAt = Date.now();
    let state: Database["public"]["Enums"]["run_state"] = "failed";
    try {
      if (schedule.target_kind === "workflow") {
        // A workflow schedule with no workflow attached must never report success:
        // that is the "configured is not connected" failure this system exists to catch.
        if (!schedule.target_id) {
          throw new Error(
            `Schedule "${schedule.key}" is set to run a workflow but no workflow is attached.`,
          );
        }
        // The run works for the schedule's tenant, named here rather than
        // resolved from the service-role client (CODE-50).
        if (!schedule.tenant_id) {
          throw new Error(
            `Schedule "${schedule.key}" names no client workspace, so it cannot run.`,
          );
        }
        const run = await runWorkflow(
          client,
          schedule.target_id,
          `schedule:${schedule.key}`,
          null,
          schedule.tenant_id,
        );
        state = run.state;
      } else {
        state = "succeeded";
      }
    } catch (error) {
      state = "failed";
      await logActivity(client, {
        actorKind: "system",
        actorId: "scheduler",
        verb: "schedule.error",
        subjectKind: "schedule",
        subjectId: schedule.id,
        summary: `${schedule.name} failed: ${(error as Error).message}`,
      });
    }

    const next = nextRunAt(schedule.cron, now);
    const { error: updateError } = await client
      .from("schedules")
      .update({
        last_run_at: now.toISOString(),
        last_state: state,
        last_duration_ms: Date.now() - startedAt,
        next_run_at: next ? next.toISOString() : null,
        failure_count: state === "failed" ? schedule.failure_count + 1 : 0,
        health: state === "failed" ? "failing" : "healthy",
      })
      .eq("id", schedule.id);
    if (updateError) throw new Error(updateError.message);

    result.ran.push({ schedule: schedule.key, state });
  }

  if (options.collectSerpBacklog !== false) await collectSerpBacklog(client);
  if (options.reconcileChangeMeasurements === true) {
    const { reconcileChangeMeasurements } = await import("./change-measurements.server");
    await reconcileChangeMeasurements(client);
  }

  return result;
}

/**
 * Sweeps queued SERP tasks whose postback never arrived. It only retrieves
 * task IDs already paid for at post time and never reposts a task, so a slow
 * provider costs nothing extra and no result is silently lost.
 */
async function collectSerpBacklog(client: Client): Promise<void> {
  const { data: queued } = await client
    .from("dataforseo_serp_tasks")
    .select("tenant_id")
    .eq("state", "queued");
  const tenantIds = [...new Set((queued ?? []).map((row) => row.tenant_id))];
  if (tenantIds.length === 0) return;

  const { collectReadySerpTasks } = await import("./dataforseo/serp.server");
  for (const tenantId of tenantIds) {
    try {
      const collected = await collectReadySerpTasks(client, tenantId);
      if (collected.collected > 0) {
        await logActivity(client, {
          tenantId,
          actorKind: "system",
          actorId: "scheduler",
          verb: "dataforseo.serp_backlog_collected",
          subjectKind: "capability",
          summary: `Collected ${collected.collected} delayed SERP task result(s); ${collected.stillQueued} still queued at the provider.`,
          payload: { ...collected },
        });
      }
    } catch {
      // A provider hiccup during backlog collection must not fail the tick.
    }
  }
}
