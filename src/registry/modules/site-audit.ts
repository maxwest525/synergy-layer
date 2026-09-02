import type { ModuleDefinition } from "../types";

/**
 * OnPage crawl findings. Read only: nothing here can change the site, the
 * crawl, or a page. Turns the eight OnPage snapshot kinds
 * `cap.dataforseo_onpage` already collects into evidence-backed
 * recommendations, closing the gap the module comment on
 * `cap.dataforseo_onpage` in `dataforseo.ts` describes: nine endpoints
 * called, a crawl run, nothing turning any of it into a finding an operator
 * sees.
 *
 * Five rules ship here (Session A of
 * docs/handoffs/2026-08-28-parallel-rule-sessions.md): `non_indexable_pages_found`,
 * `crawl_pages_error_status`, `redirect_chain_present`,
 * `duplicate_titles_across_pages`, `duplicate_descriptions_across_pages`.
 * Three crawl-meta rules that each file an operator decision rather than a
 * finding (`crawl_hit_its_page_cap`, `crawl_result_truncated`,
 * `crawl_started_never_collected`) are deferred to a follow-up PR.
 */
export const definition: ModuleDefinition = {
  module: "site-audit",
  capabilities: [
    {
      key: "site-audit.rules",
      name: "Site Audit Rule Engine",
      kind: "internal_module",
      category: "Technical",
      description:
        'Evaluates the newest stored OnPage crawl snapshot per kind and files evidence-backed findings: non-indexable pages (split by documented consequence), pages answering with an error, redirect chains, and duplicate tab titles or search descriptions. A missing or unreadable reading is named in words, never rendered as a clean zero. Writes with source_module "site-audit", which maps to the health category; the two duplicate-tag rules are routed to the pages category instead, in finding-router.ts.',
      integrationState: "real",
      operations: [
        {
          name: "rules.evaluate",
          description:
            "Read the newest onpage_non_indexable, onpage_pages, onpage_redirect_chains, onpage_duplicate_title and onpage_duplicate_description snapshots and score them against Google's own documented thresholds and consequences.",
        },
      ],
      config: { mutating: false, rulesEvaluated: 5, costUsd: 0, evidenceLabel: "observed" },
    },
    {
      key: "site.watch",
      name: "Live-site watch",
      kind: "internal_module",
      category: "Technical",
      description:
        "Fetches every sitemap address of the selected property directly, once a night, and stores what the server answered: status, final address, robots directives, canonical and title. Compares each address with its most recent earlier read and files what changed under Site health: a page that stopped answering, went noindex, or changed its canonical (CODE-87). Free: it reads the tenant's own site, calls no provider, and never changes a page.",
      integrationState: "real",
      operations: [
        {
          name: "site.read",
          description:
            "Read every sitemap address once, store one row per address and UTC date, and compare with the night before.",
        },
      ],
      config: { mutating: false, rulesEvaluated: 3, costUsd: 0, evidenceLabel: "observed" },
    },
  ],
  workflows: [
    {
      key: "site-audit-evaluate",
      name: "Site audit evaluation",
      description:
        "Re-reads the tenant's stored OnPage crawl snapshots and files evidence-backed findings from them. Costs nothing and calls no provider; it is a second pass over evidence `cap.dataforseo_onpage` already paid for.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "evaluate", kind: "capability", ref: "site-audit.rules" }],
        edges: [],
      },
    },
    {
      key: "site-nightly-watch",
      name: "Live-site nightly watch",
      description:
        "Reads every sitemap address of the selected property directly and compares it with the night before. Free and read-only; the schedule row of the same key drives it (observation-cadence.ts).",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "read", kind: "capability", ref: "site.watch" }],
        edges: [],
      },
    },
  ],
};
