import { createFileRoute } from "@tanstack/react-router";

const AUTOMATED_SCHEDULE_KEY = "gsc-daily-observe";

/** Dedicated pg_cron entry point for the free daily Search Console workflow. */
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
        if (scheduleKey !== AUTOMATED_SCHEDULE_KEY) {
          return new Response(JSON.stringify({ error: "Unsupported schedule" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const result = await tickScheduler(supabaseAdmin, new Date(), {
            onlyKeys: [AUTOMATED_SCHEDULE_KEY],
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
