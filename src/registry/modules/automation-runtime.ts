import type { ModuleDefinition } from "../types";

export const definition: ModuleDefinition = {
  module: "automation-runtime",
  capabilities: [
    {
      key: "automation.n8n",
      name: "n8n governed workflow bridge",
      kind: "connector",
      category: "Automation",
      description:
        "Bounded health probe plus one explicit, authenticated, idempotent trigger for the governed SEO workflow. Health checks never trigger workflow execution.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        {
          name: "health.probe",
          description: "Read the public n8n health endpoint without triggering a workflow.",
          mutates: false,
        },
        {
          name: "workflow.trigger",
          description:
            "Trigger the allowlisted governed SEO webhook after an explicit caller action.",
          mutates: true,
        },
      ],
      config: {
        provider: "self_hosted_n8n",
        workflow: "aoos-governed-seo",
        requiresExplicitTrigger: true,
        idempotencyRequired: true,
      },
    },
    {
      key: "automation.vps_scraper",
      name: "VPS Crawl4AI bridge",
      kind: "api",
      category: "Research",
      description:
        "Authenticated health and scrape operations limited to the governed TruMove origin, with request timeout and response-size limits.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        {
          name: "health.probe",
          description: "Read the authenticated Crawl4AI health endpoint.",
          mutates: false,
          endpoint: "GET {VPS_SCRAPER_BASE_URL}/health",
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            "The container does NOT enforce its own CRAWL4AI_API_TOKEN — it answers unauthenticated on 127.0.0.1:11235. Auth is enforced only by Caddy at the edge, so VPS_SCRAPER_API_KEY must equal the token in the Caddyfile. Sending the container's own token to the public host returns 401, which reads like a bad credential and is not one.",
        },
        {
          name: "page.scrape",
          description: "Scrape one URL on the governed TruMove origin.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        provider: "self_hosted_crawl4ai",
        originAllowlist: ["https://trumoveinc.com"],
        maxResponseBytes: 2097152,
      },
    },
  ],
  workflows: [],
};
