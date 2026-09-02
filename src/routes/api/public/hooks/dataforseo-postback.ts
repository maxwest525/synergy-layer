import { createFileRoute } from "@tanstack/react-router";

/**
 * DataForSEO Standard-queue postback receiver. The provider sends no custom
 * headers, so the callback is authenticated by the per-task token minted at
 * queue time and carried in the postback URL; the table stores only the
 * token's hash, and the body must be about the task the token belongs to.
 * Every refusal is the same 401, and no operational detail is returned to
 * any caller.
 */
export const Route = createFileRoute("/api/public/hooks/dataforseo-postback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = () =>
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });

        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return unauthorized();

        const { decidePostback, hashPostbackToken } =
          await import("@/lib/dataforseo/postback-token");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ingestSerpPostback } = await import("@/lib/dataforseo/serp.server");

        try {
          const body = (await request.json()) as Parameters<typeof ingestSerpPostback>[2];
          const { data: queued } = await supabaseAdmin
            .from("dataforseo_serp_tasks")
            .select("tenant_id, provider_task_id, tag")
            .eq("postback_token_hash", hashPostbackToken(token))
            .maybeSingle();
          const decision = decidePostback({ token, queued, body });
          if (!decision.ok) {
            // The reason stays in the server log; the caller sees one answer.
            console.error("[dataforseo-postback]", decision.reason);
            return unauthorized();
          }

          const result = await ingestSerpPostback(supabaseAdmin, decision.tenantId, body);
          return Response.json({ ok: true, ...result });
        } catch (error) {
          // The reason stays in the server log. A public caller learns only
          // that the request failed, never which variable or service did.
          console.error("[dataforseo-postback]", (error as Error).message);
          return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
