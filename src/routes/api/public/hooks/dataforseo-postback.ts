import { createFileRoute } from "@tanstack/react-router";

/**
 * DataForSEO Standard-queue postback receiver. Verified with the project
 * publishable key; it never returns operational detail to unverified callers.
 */
export const Route = createFileRoute("/api/public/hooks/dataforseo-postback")({
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
        const { ingestSerpPostback } = await import("@/lib/dataforseo/serp.server");

        try {
          const body = (await request.json()) as Parameters<typeof ingestSerpPostback>[2];
          const tag = (body.tasks ?? [])[0]?.data?.["tag"];
          const { data: queued } = await supabaseAdmin
            .from("dataforseo_serp_tasks")
            .select("tenant_id")
            .eq("tag", typeof tag === "string" ? tag : "")
            .maybeSingle();
          if (!queued) return Response.json({ ok: true, stored: 0, unmatched: true });

          const result = await ingestSerpPostback(supabaseAdmin, queued.tenant_id, body);
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
