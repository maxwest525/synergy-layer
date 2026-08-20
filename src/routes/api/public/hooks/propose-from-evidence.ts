import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily "propose from evidence" trigger for pg_cron.
 *
 * Read-only against every external provider: it reads stored Search Console
 * evidence and files proposals in the `proposed` state. Approval and execution
 * stay with the operator.
 */
export const Route = createFileRoute("/api/public/hooks/propose-from-evidence")({
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
        const { data: authorized, error: authorizationError } = await supabaseAdmin.rpc(
          "verify_scheduler_hook_token",
          { _token: presented },
        );
        if (authorizationError || authorized !== true) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { runProposalJob } = await import("@/lib/proposals/daily.server");
          const result = await runProposalJob(supabaseAdmin);
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
