import { createFileRoute } from "@tanstack/react-router";
import { supabasePublishableKey } from "@/integrations/supabase/public-config";

/**
 * DataForSEO Standard-queue postback receiver. Verified with the project
 * publishable key plus the per-task tag; it never returns operational detail
 * to any caller. The publishable key is a public identifier, so the tag and
 * the provider task id are what actually stand between a stranger and a
 * stored snapshot; replacing the key with a per-task secret is BACKLOG.md
 * CODE-34.
 */
export const Route = createFileRoute("/api/public/hooks/dataforseo-postback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = supabasePublishableKey();
        const url = new URL(request.url);
        const presented = request.headers.get("apikey") ?? url.searchParams.get("key");
        const { verifySharedSecret } = await import("@/lib/shared-secret.server");
        if (!verifySharedSecret(presented, key)) {
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
