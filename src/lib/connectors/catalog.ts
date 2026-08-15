export type ConnectorKey =
  | "supabase"
  | "google_search_console"
  | "google_analytics_4"
  | "dataforseo"
  | "firecrawl"
  | "gemini_generation"
  | "gemini_embeddings"
  | "github_executor"
  | "pagespeed_insights"
  | "serpapi"
  | "perplexity"
  | "google_ads"
  | "n8n"
  | "vps_scraper";

export type ConnectorCatalogItem = {
  key: ConnectorKey;
  label: string;
  provider: string;
  credentialStrategies: readonly (readonly string[])[];
  configRequirements?: readonly string[];
  safeConfig?: Readonly<Record<string, string>>;
};

export type ConnectorReadiness = {
  key: ConnectorKey;
  label: string;
  provider: string;
  state: "missing" | "configured";
  health: "unknown";
  secretNames: string[];
  missing: string[];
  safeConfig: Record<string, string>;
};

const item = (value: ConnectorCatalogItem): ConnectorCatalogItem => value;

export const CONNECTOR_CATALOG = [
  item({
    key: "supabase",
    label: "Supabase",
    provider: "Supabase",
    credentialStrategies: [["SUPABASE_SERVICE_ROLE_KEY"], ["SUPABASE_SECRET_KEY"]],
    configRequirements: ["SUPABASE_URL"],
    safeConfig: { baseUrl: "SUPABASE_URL" },
  }),
  item({
    key: "google_search_console",
    label: "Google Search Console",
    provider: "Google",
    credentialStrategies: [["LOVABLE_API_KEY", "GOOGLE_SEARCH_CONSOLE_API_KEY"]],
  }),
  item({
    key: "google_analytics_4",
    label: "Google Analytics 4",
    provider: "Google",
    credentialStrategies: [
      ["GA4_SERVICE_ACCOUNT_JSON"],
      ["GA4_OAUTH_CLIENT_ID", "GA4_OAUTH_CLIENT_SECRET", "GA4_OAUTH_REFRESH_TOKEN"],
    ],
  }),
  item({
    key: "dataforseo",
    label: "DataForSEO",
    provider: "DataForSEO",
    credentialStrategies: [
      ["DATAFORSEO_BASIC_TOKEN"],
      ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
    ],
  }),
  item({
    key: "firecrawl",
    label: "Firecrawl",
    provider: "Firecrawl",
    credentialStrategies: [["FIRECRAWL_API_KEY"]],
  }),
  item({
    key: "gemini_generation",
    label: "Gemini generation",
    provider: "Google",
    credentialStrategies: [["GEMINI_API_KEY"]],
    configRequirements: ["GEMINI_MODEL"],
    safeConfig: { model: "GEMINI_MODEL" },
  }),
  item({
    key: "gemini_embeddings",
    label: "Gemini embeddings",
    provider: "Google",
    credentialStrategies: [["GEMINI_API_KEY"]],
    safeConfig: { model: "GEMINI_EMBEDDING_MODEL" },
  }),
  item({
    key: "github_executor",
    label: "GitHub executor",
    provider: "GitHub",
    credentialStrategies: [["GITHUB_EXECUTOR_TOKEN"]],
  }),
  item({
    key: "pagespeed_insights",
    label: "PageSpeed Insights",
    provider: "Google",
    credentialStrategies: [["PAGESPEED_API_KEY"]],
  }),
  item({
    key: "serpapi",
    label: "SerpAPI",
    provider: "SerpAPI",
    credentialStrategies: [["SERPAPI_API_KEY"]],
  }),
  item({
    key: "perplexity",
    label: "Perplexity",
    provider: "Perplexity",
    credentialStrategies: [["PERPLEXITY_API_KEY"]],
  }),
  item({
    key: "google_ads",
    label: "Google Ads",
    provider: "Google",
    credentialStrategies: [
      ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_ACCESS_TOKEN"],
      [
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_CUSTOMER_ID",
        "GOOGLE_ADS_OAUTH_CLIENT_ID",
        "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
        "GOOGLE_ADS_OAUTH_REFRESH_TOKEN",
      ],
    ],
    safeConfig: { customerId: "GOOGLE_ADS_CUSTOMER_ID" },
  }),
  item({
    key: "n8n",
    label: "n8n",
    provider: "Self-hosted",
    credentialStrategies: [["N8N_API_KEY"]],
    configRequirements: ["N8N_BASE_URL"],
    safeConfig: { baseUrl: "N8N_BASE_URL" },
  }),
  item({
    key: "vps_scraper",
    label: "VPS scraper",
    provider: "Self-hosted",
    credentialStrategies: [["VPS_SCRAPER_API_KEY"]],
    configRequirements: ["VPS_SCRAPER_BASE_URL"],
    safeConfig: { baseUrl: "VPS_SCRAPER_BASE_URL" },
  }),
] as const satisfies readonly ConnectorCatalogItem[];

function present(env: Record<string, string | undefined>, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function safeValue(name: string, raw: string): string {
  const value = raw.trim();
  if (name.toLowerCase().includes("url")) return value.replace(/\/+$/, "");
  if (name === "GOOGLE_ADS_CUSTOMER_ID") return value.replace(/\D/g, "");
  return value;
}

export function describeConnectorReadiness(
  env: Record<string, string | undefined>,
): ConnectorReadiness[] {
  return CONNECTOR_CATALOG.map((connector) => {
    const strategies = connector.credentialStrategies.map((strategy) => ({
      names: [...strategy],
      missing: strategy.filter((name) => !present(env, name)),
    }));
    const selected =
      strategies.find((strategy) => strategy.missing.length === 0) ??
      [...strategies].sort(
        (left, right) => left.missing.length - right.missing.length || left.names.length - right.names.length,
      )[0]!;
    const missingConfig = (connector.configRequirements ?? []).filter(
      (name) => !present(env, name),
    );
    const safeConfig = Object.fromEntries(
      Object.entries(connector.safeConfig ?? {}).flatMap(([key, name]) => {
        const value = env[name];
        return value?.trim() ? [[key, safeValue(name, value)]] : [];
      }),
    );
    if (connector.key === "gemini_embeddings" && !safeConfig["model"]) {
      safeConfig["model"] = "gemini-embedding-001";
    }

    const missing = [...selected.missing, ...missingConfig];
    return {
      key: connector.key,
      label: connector.label,
      provider: connector.provider,
      state: missing.length === 0 ? "configured" : "missing",
      health: "unknown",
      secretNames: selected.names.filter((name) => present(env, name)),
      missing,
      safeConfig,
    };
  });
}

