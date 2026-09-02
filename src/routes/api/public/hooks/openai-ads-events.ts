import { createFileRoute } from "@tanstack/react-router";

/**
 * Cross-project bridge for OpenAI Ads instrumentation. The instrumented site
 * posts the events it actually fired; AOOS stores them verbatim. The endpoint
 * is fail-closed: without the shared bridge secret it accepts nothing, and it
 * never returns operational detail to unverified callers.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-aoos-bridge-secret",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/public/hooks/openai-ads-events")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const secret = process.env["OPENAI_ADS_BRIDGE_SECRET"]?.trim();
        if (!secret) {
          return json({ ok: false, error: "Bridge not configured" }, 503);
        }
        const presented = request.headers.get("x-aoos-bridge-secret");
        const { verifySharedSecret } = await import("@/lib/shared-secret.server");
        if (!verifySharedSecret(presented, secret)) {
          return json({ ok: false, error: "Unauthorized" }, 401);
        }

        const { ingestOpenAiAdsEvents, ingestPayloadSchema } =
          await import("@/lib/openai-ads/ingest.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let parsed;
        try {
          parsed = ingestPayloadSchema.safeParse(await request.json());
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }
        if (!parsed.success) {
          return json({ ok: false, error: "Invalid payload" }, 400);
        }

        // An empty batch is an explicit health check: it verifies the secret and
        // the endpoint without storing anything.
        if (parsed.data.events.length === 0) {
          return json({ ok: true, accepted: true, stored: 0, healthCheck: true }, 200);
        }

        const result = await ingestOpenAiAdsEvents(
          supabaseAdmin as unknown as Parameters<typeof ingestOpenAiAdsEvents>[0],
          parsed.data,
        );
        if (!result.ok) {
          return json({ ok: false, error: result.error }, result.status);
        }
        return json({ ok: true, accepted: true, stored: result.stored }, 200);
      },
    },
  },
});
