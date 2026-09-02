import { createFileRoute } from "@tanstack/react-router";

/**
 * The single server-side conversions entry point. The website's server-side
 * function reports a conversion here; AOOS decides whether it is configured,
 * allowed, and deliverable, then sends it to the provider itself. The website
 * never holds the provider credential and never talks to the provider
 * directly.
 *
 * Fail-closed: the caller's tenant is resolved from the payload's slug first,
 * the secret is the one that tenant's connection names, an unknown tenant
 * and a wrong secret get the same answer, and no operational detail is
 * returned to unverified callers. There is no CORS surface: the only caller
 * is a server, and a browser caller would have to ship the secret.
 */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/openai-ads-conversions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveBridgeSecret } = await import("@/lib/openai-ads/bridge-secret.server");
        const { verifySharedSecret } = await import("@/lib/shared-secret.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }
        const slug =
          body && typeof body === "object" ? (body as { tenant_slug?: unknown }).tenant_slug : null;
        if (typeof slug !== "string" || !slug) {
          return json({ ok: false, error: "Invalid conversion request" }, 400);
        }

        const bridge = await resolveBridgeSecret(
          supabaseAdmin as unknown as Parameters<typeof resolveBridgeSecret>[0],
          slug,
          // The conversions route once read a second variable name; a host
          // that still carries only that one keeps working.
          { alsoTry: ["OPENAI_ADS_CAPI_BRIDGE_SECRET"] },
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

        // An empty batch is an explicit health check: it proves the secret and
        // the route without sending anything to the provider.
        if (
          Array.isArray((body as { conversions?: unknown[] }).conversions) &&
          (body as { conversions: unknown[] }).conversions.length === 0
        ) {
          return json({ ok: true, healthCheck: true, results: [] }, 200);
        }

        const { deliverConversions } = await import("@/lib/openai-ads/capi.server");
        const outcome = await deliverConversions(supabaseAdmin, body);
        if (!outcome.ok) return json({ ok: false, error: outcome.error }, outcome.status);

        return json(
          {
            ok: true,
            validateOnly: outcome.validateOnly,
            summary: outcome.summary,
            results: outcome.results,
          },
          200,
        );
      },
    },
  },
});
