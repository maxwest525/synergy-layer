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
  ],
};
