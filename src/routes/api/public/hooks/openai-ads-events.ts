import { createFileRoute } from "@tanstack/react-router";

/**
 * Cross-project bridge for OpenAI Ads instrumentation. The instrumented
 * site's server-side function posts the events it actually fired; AOOS
 * stores them verbatim. The endpoint is fail-closed: the caller's tenant is
 * resolved from the payload's slug first, the secret is the one that
 * tenant's connection names, an unknown tenant and a wrong secret get the
 * same answer, and no operational detail is returned to unverified callers.
 * There is no CORS surface: the only caller is a server, and a browser
 * caller would have to ship the secret.
 */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/openai-ads-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { ingestOpenAiAdsEvents, ingestPayloadSchema } =
          await import("@/lib/openai-ads/ingest.server");
        const { resolveBridgeSecret } = await import("@/lib/openai-ads/bridge-secret.server");
        const { verifySharedSecret } = await import("@/lib/shared-secret.server");
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

        const bridge = await resolveBridgeSecret(
          supabaseAdmin as unknown as Parameters<typeof resolveBridgeSecret>[0],
          parsed.data.tenantSlug,
        );
        if (bridge.state === "unconfigured") {
          return json({ ok: false, error: "Bridge not configured" }, 503);
        }
        if (
          bridge.state !== "ok" ||
          !verifySharedSecret(request.headers.get("x-aoos-bridge-secret"), bridge.secret)
        ) {
          return json({ ok: false, error: "Unauthorized" }, 401);
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
