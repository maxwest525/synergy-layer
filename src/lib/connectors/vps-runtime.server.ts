type RuntimeOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function publicUrl(raw: string): string {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP(S) crawl targets are allowed.");
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/i.test(
      url.hostname,
    ) || url.hostname.toLowerCase().endsWith(".local")
  ) {
    throw new Error("Private or loopback crawl targets are not allowed.");
  }
  return url.toString();
}

async function boundedFetch(url: string, init: RequestInit, options: RuntimeOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    return await (options.fetcher ?? fetch)(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function crawlWithVps(rawTargetUrl: string, options: RuntimeOptions = {}) {
  const env = options.env ?? process.env;
  const baseUrl = required(env, "VPS_SCRAPER_BASE_URL").replace(/\/+$/, "");
  const response = await boundedFetch(
    `${baseUrl}/crawl`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${required(env, "VPS_SCRAPER_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: [publicUrl(rawTargetUrl)] }),
    },
    options,
  );
  if (!response.ok) throw new Error(`Crawl4AI request failed with HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

export async function triggerGovernedSeoWorkflow(
  input: { runId: string; targetUrl: string; idempotencyKey: string },
  options: RuntimeOptions = {},
) {
  const env = options.env ?? process.env;
  const response = await boundedFetch(
    required(env, "N8N_SEO_WORKFLOW_WEBHOOK_URL"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${required(env, "N8N_WEBHOOK_SECRET")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ ...input, targetUrl: publicUrl(input.targetUrl) }),
    },
    options,
  );
  if (!response.ok) throw new Error(`n8n workflow request failed with HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}
