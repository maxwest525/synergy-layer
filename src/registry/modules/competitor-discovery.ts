import type { ModuleDefinition } from "../types";

/**
 * Labs (`competitors_domain`), Domain Analytics (whois, technologies) and
 * Content Analysis all store snapshots that no rule reads. This module turns
 * them into the four rules that survived the adversarial review in
 * docs/handoffs/2026-08-28-parallel-rule-sessions.md, Session D.
 *
 * Two of the four -- the ownership pair -- never assert a link between
 * domains: COMPETITIVE_MODEL.md §4 and §7 require ownership to stay
 * operator-declared, so a match here files a candidate for the operator to
 * confirm or reject and nothing more. Read-only throughout: nothing here can
 * change a site, a SERP, or a link, and the evaluation pass itself calls no
 * provider.
 */
export const definition: ModuleDefinition = {
  module: "competitor-discovery",
  capabilities: [
    {
      key: "discovery.competition_findings",
      name: "Competitor discovery findings",
      kind: "internal_module",
      category: "Organic",
      description:
        "Re-reads stored Labs, Domain Analytics and Content Analysis snapshots and files what they show: an overlap lookup that came back full, a mention of the brand on a page that already ranks alongside you, and -- as a candidate for you to confirm or reject, never a stated fact -- two known domains sharing registration details or an identical technology stack.",
      integrationState: "real",
      operations: [
        {
          name: "discovery.evaluate",
          description: "Turn stored snapshots into findings and ownership candidates.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_dataforseo_snapshots",
        ownershipDecision: "operator_confirms_or_rejects",
      },
    },
  ],
  workflows: [
    {
      key: "dfs-discovery-findings",
      name: "Competitor discovery findings",
      description:
        "Re-reads stored Labs, Domain Analytics and Content Analysis evidence and files the four discovery rules. Costs nothing: it calls no provider, only Postgres, and it never writes an ownership link on its own -- the two ownership rules file a pending candidate for an operator to confirm or reject.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "evaluate", kind: "capability", ref: "discovery.competition_findings" }],
        edges: [],
      },
    },
  ],
};
