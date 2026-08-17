import { createServerFn } from "@tanstack/react-start";

/**
 * Read model for the approvals queue: everything that is genuinely waiting on
 * an operator's yes or no, plus the other decision queues that own their own
 * review surface. Counts come from stored rows only, so an empty queue means
 * nothing is pending rather than nothing was read.
 */

export type PendingApprovalRow = {
  id: string;
  title: string;
  targetUrl: string;
  proposalType: string;
  rationale: string;
  evidenceSummary: string;
  evidenceLimitations: string;
  riskNote: string | null;
  implementationMethod: string;
  proposedAt: string;
  revisionCount: number;
};

export type OtherQueueRow = {
  key: "keywords" | "competitors";
  label: string;
  pending: number;
  instruction: string;
  to: "/keywords" | "/competitors";
  actionLabel: string;
};

export type PendingApprovalsView = {
  authenticated: boolean;
  changes: PendingApprovalRow[];
  otherQueues: OtherQueueRow[];
};

const empty: PendingApprovalsView = { authenticated: false, changes: [], otherQueues: [] };

export const listPendingApprovals = createServerFn({ method: "GET" }).handler(
  async (): Promise<PendingApprovalsView> => {
    const { createRequestClient, resolveTenantId } = await import("./tenant.server");
    const { db, authenticated } = createRequestClient();
    if (!authenticated) return empty;
    const tenantId = await resolveTenantId(db);
    if (!tenantId) return { ...empty, authenticated: true };

    const [changes, keywords, competitors] = await Promise.all([
      db
        .from("change_requests")
        .select(
          "id, title, target_url, proposal_type, rationale, evidence_summary, evidence_limitations, risk_note, implementation_method, proposed_at, revision_count",
        )
        .eq("tenant_id", tenantId)
        .eq("state", "proposed")
        .order("proposed_at", { ascending: true })
        .limit(100),
      db
        .from("keyword_candidates")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("review_state", "pending")
        .limit(500),
      db
        .from("competitor_candidates")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("review_state", "pending")
        .limit(500),
    ]);

    if (changes.error) throw new Error(changes.error.message);

    const keywordPending = keywords.data?.length ?? 0;
    const competitorPending = competitors.data?.length ?? 0;

    const otherQueues: OtherQueueRow[] = [];
    if (keywordPending > 0) {
      otherQueues.push({
        key: "keywords",
        label: `${keywordPending} keyword candidate${keywordPending === 1 ? "" : "s"} pending`,
        pending: keywordPending,
        instruction: "Accept or reject them so tracking can start.",
        to: "/keywords",
        actionLabel: "Review keywords",
      });
    }
    if (competitorPending > 0) {
      otherQueues.push({
        key: "competitors",
        label: `${competitorPending} competitor candidate${competitorPending === 1 ? "" : "s"} pending`,
        pending: competitorPending,
        instruction: "Confirm which of them you actually compete with.",
        to: "/competitors",
        actionLabel: "Review competitors",
      });
    }

    return {
      authenticated: true,
      changes: (changes.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        targetUrl: row.target_url,
        proposalType: row.proposal_type,
        rationale: row.rationale,
        evidenceSummary: row.evidence_summary,
        evidenceLimitations: row.evidence_limitations,
        riskNote: row.risk_note ?? null,
        implementationMethod: row.implementation_method,
        proposedAt: row.proposed_at,
        revisionCount: row.revision_count,
      })),
      otherQueues,
    };
  },
);
