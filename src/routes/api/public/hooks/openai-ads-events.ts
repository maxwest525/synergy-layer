import { createFileRoute } from "@tanstack/react-router";

/**
 * Cross-project bridge for OpenAI Ads instrumentation. The instrumented site
 * posts the events it actually fired; AOOS stores them verbatim. The endpoint
 * is fail-closed: without the shared bridge secret it accepts nothing, and it
 * never returns operational detail to unverified callers.
 */
export const Route = createFileRoute("/api/public/hooks/openai-ads-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["OPENAI_ADS_BRIDGE_SECRET"]?.trim();
        if (!secret) {
          return Response.json({ error: "Bridge not configured" }, { status: 503 });
        }
        const presented = request.headers.get("x-aoos-bridge-secret");
        if (presented !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { ingestOpenAiAdsEvents, ingestPayloadSchema } = await import(
          "@/lib/openai-ads/ingest.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let parsed;
        try {
          parsed = ingestPayloadSchema.safeParse(await request.json());
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        if (!parsed.success) {
          return Response.json({ error: "Invalid payload" }, { status: 400 });
        }

        const result = await ingestOpenAiAdsEvents(
          supabaseAdmin as unknown as Parameters<typeof ingestOpenAiAdsEvents>[0],
          parsed.data,
        );
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: result.status });
        }
        return Response.json({ ok: true, stored: result.stored });
      },
    },
  },
});
