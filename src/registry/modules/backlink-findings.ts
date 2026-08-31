import type { ModuleDefinition } from "../types";

/**
 * The reading half of `cap.dataforseo_backlinks`. Six Backlinks endpoints are
 * collected on every baseline (`dataforseo.ts` owns the calls); until this
 * module existed only one of them fed a finding
 * (`referring_domain_movement`, in `dataforseo/targeting-rules.server.ts`).
 * This re-reads three more of the already-stored, already-paid-for snapshots
 * and files what they show. Read-only: it calls no provider and never
 * changes a site, a page, or a link.
 */
export const definition: ModuleDefinition = {
  module: "backlink-findings",
  capabilities: [
    {
      key: "backlinks.findings",
      name: "Backlink findings",
      kind: "internal_module",
      category: "Authority",
      description:
        "Re-reads the stored backlinks_domain_pages, backlinks_backlinks, backlinks_summary and backlinks_referring_domains snapshots and files a linked page answering with an error, a linked page the site audit has never read, and a note when the referring-domain movement check is reading a capped list rather than the whole profile. Costs nothing and calls no provider.",
      integrationState: "real",
      operations: [
        {
          name: "backlinks.evaluate_findings",
          description:
            "Score stored Backlinks snapshots against the three rules and file findings.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_dataforseo_backlinks_snapshots",
      },
    },
  ],
  workflows: [
    {
      key: "backlink-findings-evaluate",
      name: "Backlink findings",
      description:
        "Turns the stored DataForSEO Backlinks snapshots into findings: an inbound link to a page answering with an error, a linked page the audit has never read, and a partial-coverage note on the referring-domain movement check. Manual, and safe to re-run at no cost.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "evaluate", kind: "capability", ref: "backlinks.findings" }],
        edges: [],
      },
    },
  ],
};
