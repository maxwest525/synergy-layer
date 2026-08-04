import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduler tick endpoint for pg_cron. Authenticated with the project
 * publishable key; it never returns operational detail to unverified callers.
 */
export const Route = createFileRoute("/api/public/hooks/scheduler-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const presented = request.headers.get("apikey");
        if (!key || presented !== key) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { tickScheduler } = await import("@/lib/scheduler.server");

        try {
          const result = await tickScheduler(supabaseAdmin);
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
