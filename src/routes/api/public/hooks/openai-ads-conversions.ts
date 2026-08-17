import { createFileRoute } from "@tanstack/react-router";

/**
 * The single server-side conversions entry point. The website reports a
 * conversion here; AOOS decides whether it is configured, allowed, and
 * deliverable, then sends it to the provider itself. The website never holds
 * the provider credential and never talks to the provider directly.
 *
 * Fail-closed: without the shared bridge secret nothing is accepted, and no
 * operational detail is returned to unverified callers.
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

export const Route = createFileRoute("/api/public/hooks/openai-ads-conversions")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const secret =
          process.env["OPENAI_ADS_CAPI_BRIDGE_SECRET"]?.trim() ??
          process.env["OPENAI_ADS_BRIDGE_SECRET"]?.trim();
        if (!secret) return json({ ok: false, error: "Bridge not configured" }, 503);
        if (request.headers.get("x-aoos-bridge-secret") !== secret) {
          return json({ ok: false, error: "Unauthorized" }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }

        // An empty batch is an explicit health check: it proves the secret and
        // the route without sending anything to the provider.
        if (
          body &&
          typeof body === "object" &&
          Array.isArray((body as { conversions?: unknown[] }).conversions) &&
          (body as { conversions: unknown[] }).conversions.length === 0
        ) {
          return json({ ok: true, healthCheck: true, results: [] }, 200);
        }

        const { deliverConversions } = await import("@/lib/openai-ads/capi.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
