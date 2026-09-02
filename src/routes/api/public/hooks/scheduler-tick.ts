import { createFileRoute } from "@tanstack/react-router";

/** Only these read-only observation schedules may be triggered by pg_cron. */
const AUTOMATED_SCHEDULE_KEYS = new Set([
  "gsc-daily-observe",
  "ga4-daily-observe",
  "umami-daily-observe",
]);

/** Dedicated pg_cron entry point for the free daily observation workflows. */
export const Route = createFileRoute("/api/public/hooks/scheduler-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented = request.headers.get("x-aoos-scheduler-token");
        if (!presented) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recordScheduleFiring, tickScheduler } = await import("@/lib/scheduler.server");

        const { data: authorized, error: authorizationError } = await supabaseAdmin.rpc(
          "verify_scheduler_hook_token",
          {
            _token: presented,
          },
        );
        if (authorizationError || authorized !== true) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const body = await request.json().catch(() => null);
        const scheduleKey =
          body && typeof body === "object" && "scheduleKey" in body
            ? (body as { scheduleKey?: unknown }).scheduleKey
            : null;
        if (typeof scheduleKey !== "string" || !AUTOMATED_SCHEDULE_KEYS.has(scheduleKey)) {
          return new Response(JSON.stringify({ error: "Unsupported schedule" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const firedAt = new Date();
        try {
          const result = await tickScheduler(supabaseAdmin, firedAt, {
            onlyKeys: [scheduleKey],
            collectSerpBacklog: false,
            reconcileChangeMeasurements: true,
            firedBy: "pg_cron",
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          // The reason stays in the server log and on the firing's own row;
          // a public caller learns only that the tick failed. A tick that
          // throws before claiming anything leaves no schedule row update, so
          // the firing is written here against the schedule pg_cron named
          // (CODE-48).
          const message = (error as Error).message;
          console.error("[scheduler-tick]", message);
          const { data: schedule } = await supabaseAdmin
            .from("schedules")
            .select("id, tenant_id")
            .eq("key", scheduleKey)
            .maybeSingle();
          if (schedule) {
            await recordScheduleFiring(supabaseAdmin, {
              tenantId: schedule.tenant_id,
              scheduleId: schedule.id,
              scheduleKey,
              firedBy: "pg_cron",
              state: "failed",
              firedAt,
              durationMs: Date.now() - firedAt.getTime(),
              result: {},
              error: message,
            }).catch((recordError: Error) => {
              console.error("[scheduler-tick] firing not written down", recordError.message);
            });
          }
          return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
