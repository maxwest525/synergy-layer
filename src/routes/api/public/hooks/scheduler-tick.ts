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
        const { tickScheduler } = await import("@/lib/scheduler.server");

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

        try {
          const result = await tickScheduler(supabaseAdmin, new Date(), {
            onlyKeys: [scheduleKey],
            collectSerpBacklog: false,
            reconcileChangeMeasurements: true,
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
