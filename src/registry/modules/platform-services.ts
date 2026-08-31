import type { ModuleDefinition } from "../types";

/**
 * The connectors that carry the runtime rather than a marketing surface:
 * the model provider, the repository executor, the page-speed bridge, and the
 * database itself.
 *
 * They were the last four with no registry entry, which is its own small
 * lesson: the pieces nobody thinks of as "integrations" are exactly the ones
 * whose limits go unrecorded until something fails.
 */
export const definition: ModuleDefinition = {
  module: "platform-services",
  capabilities: [
    {
      key: "cap.gemini",
      name: "Gemini (direct)",
      kind: "connector",
      category: "Models",
      description:
        "Google's own Gemini endpoints. Generation is the fallback when the LiteLLM proxy is unconfigured; embeddings still go here by default.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        {
          name: "models.get",
          description: "Model metadata. Free, and the health probe for both Gemini connectors.",
          endpoint: "GET https://generativelanguage.googleapis.com/v1beta/models/{model}?key=",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
        {
          name: "generateContent",
          description:
            "Structured JSON generation. Taken only when litellmConfigured() is false — the proxy is preferred.",
          endpoint:
            "POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "embedContent / batchEmbedContents",
          description: "Knowledge-store embeddings, 768 dimensions, batched 50 at a time.",
          endpoint:
            "POST https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
          gotcha:
            "Sends taskType RETRIEVAL_DOCUMENT for stored text and RETRIEVAL_QUERY for searches. The LiteLLM/OpenAI shape cannot express taskType, so the two paths do not produce interchangeable vectors — switching means re-embedding the store. That is why the proxy path is opt-in behind LITELLM_MODEL_EMBEDDING.",
        },
      ],
      config: {
        mutating: false,
        credentials: "GEMINI_API_KEY",
        dimensions: 768,
        preferred: "LiteLLM proxy for generation; direct is the fallback",
      },
    },
    {
      key: "cap.github_executor",
      name: "GitHub executor",
      kind: "connector",
      category: "Execution",
      description:
        "Repository reads and the governed change path. Scoped to a single allowlisted repository.",
      integrationState: "real",
      authKind: "bearer",
      operations: [
        {
          name: "repos.get",
          description: "Repository metadata. The health probe.",
          endpoint: "GET https://api.github.com/repos/{owner}/{repo}",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            "A User-Agent header is mandatory. Without one the deployed worker runtime sends none and GitHub answers 403, which this probe previously reported as a failing credential on a working token.",
        },
      ],
      config: {
        mutating: false,
        credentials: "GITHUB_EXECUTOR_TOKEN",
        scope: "the allowlisted governed repository only",
      },
    },
    {
      key: "cap.pagespeed_insights",
      name: "PageSpeed Insights",
      kind: "connector",
      category: "Performance",
      description:
        "Core Web Vitals and Lighthouse audits for a URL, run on operator action rather than a schedule.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        {
          name: "runPagespeed",
          description: "Lighthouse run for one URL.",
          endpoint:
            "GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=&key=&strategy=",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
          gotcha:
            "The key is optional for the endpoint but required in practice: unauthenticated calls exhausted the anonymous quota and returned HTTP 429, so no measurement was ever stored. There is no free metadata route, so this connector has no safe probe and reads 'configured, unprovable'.",
        },
      ],
      config: {
        mutating: false,
        credentials: "PAGESPEED_API_KEY",
        probe: "none — no free endpoint that is not itself a Lighthouse run",
      },
    },
    {
      key: "cap.supabase",
      name: "Supabase (project database)",
      kind: "connector",
      category: "Storage",
      description:
        "The evidence store. Every snapshot, observation and change request lives here; row level security scopes reads to tenant members and writes to operators.",
      integrationState: "real",
      authKind: "service_role",
      operations: [
        {
          name: "rest",
          description: "PostgREST root. The health probe.",
          endpoint: "GET {SUPABASE_URL}/rest/v1/",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
      ],
      config: {
        mutating: true,
        credentials: "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY, plus SUPABASE_URL",
        gotcha:
          "This project's Supabase is Lovable-managed. It answers 401 publicly but does not appear in the operator's own Supabase organisation, and the Supabase MCP refuses it — that is expected, not a fault. Schema changes go through in-repo migrations, never a hand-written statement.",
        note: "Credentials are injected by Lovable Cloud rather than set as project secrets, which is why they are absent from the secrets list while the connector probes healthy.",
      },
    },
  ],
};
