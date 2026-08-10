import type { ModuleDefinition } from "../types";

/**
 * DataForSEO enters AOOS as three separate observation capabilities, one per
 * data family, so the registry keeps stating exactly what is wired. All are
 * read-only: nothing here can change a site, a SERP, or a link.
 */
export const definition: ModuleDefinition = {
  module: "dataforseo",
  capabilities: [
    {
      key: "cap.dataforseo_labs",
      name: "DataForSEO Labs",
      kind: "api",
      category: "Organic",
      description:
        "Keyword intelligence from the DataForSEO Labs database. Labs proposes a keyword set; a human approves it. Values are estimates, never authoritative for owned performance: Search Console remains the truth for that.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        { name: "keywords.for_site", description: "Keywords the provider already associates with the owned domain.", mutates: false },
        { name: "keywords.suggest", description: "Expansions of the property's own Search Console queries.", mutates: false },
        { name: "keywords.ranked", description: "Collect the ranked keyword landscape for a domain.", mutates: false },
      ],
      config: {
        mutating: false,
        evidenceLabel: "estimated",
        cadence: "weekly",
        mode: "live",
        requiresApproval: "keyword_set",
        monthlyBudgetUsd: 300,
        digest: "docs/integrations/dataforseo/DIGEST.md",
        note: "Intersection-based competitor discovery is deliberately retired: it returns social and directory domains for thin-footprint sites. Competitors are derived from observed SERPs instead.",
      },
    },
    {
      key: "serp.competitors",
      name: "SERP competitor derivation",
      kind: "internal_module",
      category: "Organic",
      description:
        "Rebuilds the competitor set from the SERPs AOOS actually observed. A domain becomes a competitor by repeatedly ranking for approved keywords, not by sharing a couple of keywords in a database. Aggregators and social networks are classified as surfaces, never competitors.",
      integrationState: "real",
      operations: [
        { name: "competitors.derive", description: "Re-read stored SERP snapshots and classify ranking domains.", mutates: false },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_serp_snapshots",
      },
    },
    {
      key: "cap.dataforseo_serp",
      name: "DataForSEO SERP",
      kind: "api",
      category: "Organic",
      description:
        "SERP composition observation. Scheduled collection uses the Standard queue with a postback; Live is reserved for operator-requested real-time investigation.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        { name: "serp.queue", description: "Queue Standard SERP tasks with a postback callback.", mutates: false },
        { name: "serp.ingest_postback", description: "Store a provider callback as an immutable snapshot.", mutates: false },
        { name: "serp.live", description: "Operator-initiated real-time SERP inspection.", mutates: false },
      ],
      config: {
        mutating: false,
        scheduledMode: "standard",
        liveUse: "operator_requested_only",
        postbackPath: "/api/public/hooks/dataforseo-postback",
        monthlyBudgetUsd: 300,
      },
    },
    {
      key: "cap.dataforseo_backlinks",
      name: "DataForSEO Backlinks",
      kind: "api",
      category: "Authority",
      description:
        "Backlink profile and referring-domain baseline for owned properties. Competitor link-gap analysis is deliberately not enabled yet.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        { name: "backlinks.summary", description: "Whole-profile authority, spam score, and dofollow split.", mutates: false },
        { name: "backlinks.referring_domains", description: "Referring-domain baseline.", mutates: false },
        { name: "backlinks.backlinks", description: "One backlink per referring domain, deduplicated server-side.", mutates: false },
      ],
      config: {
        mutating: false,
        scope: "owned_properties_only",
        accessSubscriptionUsdPerMonth: 100,
        monthlyBudgetUsd: 300,
      },
    },
  ],
  workflows: [
    {
      key: "dfs-competitor-discovery",
      name: "DataForSEO competitor discovery",
      description:
        "Discovers the organic competitor universe from the actual search landscape and files candidates for operator review. It never starts recurring tracking on its own.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "discover", kind: "capability", ref: "cap.dataforseo_labs" }],
        edges: [],
      },
    },
    {
      key: "dfs-backlink-baseline",
      name: "DataForSEO backlink baseline",
      description:
        "Establishes the owned-property backlink and referring-domain baseline as immutable evidence.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "baseline", kind: "capability", ref: "cap.dataforseo_backlinks" }],
        edges: [],
      },
    },
    {
      key: "dfs-serp-observe",
      name: "DataForSEO SERP observation",
      description:
        "Queues Standard SERP tasks for tracked queries and stores provider callbacks as immutable snapshots.",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "queue", kind: "capability", ref: "cap.dataforseo_serp" }],
        edges: [],
      },
    },
  ],
};
