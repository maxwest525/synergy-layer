import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildCrawlDirectiveFix, fixTargetForSiteCheck } from "./audit-fixes";
import { GOVERNED_BRANCH, GOVERNED_PROJECT_ID, GOVERNED_REPO } from "./execution/allowlist";
import { createGithubApi } from "./execution/execute.server";
import { applyExactReplacements } from "./execution/source-change";
import type { SiteCheckId, SiteFacts } from "./site-checks";
import { evaluateSite } from "./site-checks";
import { blockedPaths } from "./robots-rules";

/**
 * The declared pages robots.txt disallows, as paths.
 *
 * The finding's own text names only the first few, so the fix recomputes the
 * full set from the same stored facts the finding was derived from.
 */
function blockedDeclaredPaths(facts: SiteFacts): string[] {
  if (!facts.robotsBody) return [];
  const paths = (facts.declaredPages ?? []).flatMap((page) => {
    try {
      const parsed = new URL(page);
      return parsed.origin === facts.origin ? [`${parsed.pathname}${parsed.search}`] : [];
    } catch {
      return page.startsWith("/") ? [page] : [];
    }
  });
  return [...blockedPaths(facts.robotsBody, [...new Set(paths)])];
}

type Client = SupabaseClient<Database>;

export type PreparedProposal = {
  proposalType: string;
  targetUrl: string;
  title: string;
  changes: Record<string, unknown>[];
  rationale: string;
  evidence: Record<string, unknown>[];
  evidenceSummary: string;
  evidenceLimitations: string;
  riskNote: string;
  generationContext: Record<string, unknown>;
  sourceRepo: string;
  sourceBranch: string;
  sourceFile: string;
  sourceProjectId: string;
  sourceRevisionBefore: string;
};

async function latestSiteSnapshot(
  client: Client,
  tenantId: string,
): Promise<{ facts: SiteFacts; observedAt: string }> {
  const { data, error } = await client
    .from("site_audit_snapshots")
    .select("facts, observed_at")
    .eq("tenant_id", tenantId)
    .order("observed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  const facts = row?.facts as SiteFacts | undefined;
  if (!facts || typeof facts.origin !== "string") {
    throw new Error("Run the audit first: no stored site read backs this fix.");
  }
  return { facts, observedAt: row?.observed_at ?? new Date().toISOString() };
}

/**
 * Turn one stored site level finding into an exact, executable robots.txt edit,
 * proven against the current source file before it is ever offered for review.
 */
export async function prepareSiteFixProposal(
  client: Client,
  tenantId: string,
  check: SiteCheckId,
): Promise<PreparedProposal> {
  const target = fixTargetForSiteCheck(check);
  if (!target) throw new Error("That finding has no governed fix yet, so it stays a manual fix.");

  const { facts, observedAt } = await latestSiteSnapshot(client, tenantId);
  const finding = evaluateSite(facts).find((entry) => entry.check === check);
  if (!finding) {
    throw new Error("That defect is no longer present in the stored site read.");
  }

  const github = createGithubApi();
  if (!github) {
    throw new Error(
      "An executable source baseline cannot be proven: GITHUB_EXECUTOR_TOKEN is not configured.",
    );
  }
  const head = await github.branchHead(GOVERNED_REPO, GOVERNED_BRANCH);
  const source = await github.readFile(GOVERNED_REPO, target.filePath, head);

  // Recomputed from the stored facts rather than parsed back out of the
  // finding's prose, which only ever names the first three. Recorded on the
  // evidence below as well as applied, because the outcome of a crawl
  // directive change is whether THESE pages became reachable, and nothing
  // else on the request says which pages the edit was for.
  const blockedPaths = blockedDeclaredPaths(facts);

  const built = buildCrawlDirectiveFix({
    check,
    robotsContent: source.content,
    sitemapUrl: facts.sitemapUrl ?? `${facts.origin}/sitemap.xml`,
    blockedPaths,
  });
  if ("error" in built) throw new Error(built.error);

  const simulation = applyExactReplacements(source.content, built.changes);
  if (!simulation.ok) throw new Error(simulation.reason);
  if (simulation.value.alreadyApplied) {
    throw new Error("The source already contains this fix, so no proposal was created.");
  }

  return {
    proposalType: target.changeKind,
    targetUrl: facts.origin,
    title: built.title,
    changes: built.changes as unknown as Record<string, unknown>[],
    rationale: built.rationale,
    evidence: [
      {
        source: "site_read",
        check,
        label: finding.label,
        detail: finding.detail,
        origin: facts.origin,
        robotsStatus: facts.robotsStatus,
        sitemapUrl: facts.sitemapUrl,
        sitemapStatus: facts.sitemapStatus,
        sitemapUrlCount: facts.sitemapUrlCount,
        blockedPaths,
        observedAt,
      },
      {
        source: "governed_source",
        repo: GOVERNED_REPO,
        branch: GOVERNED_BRANCH,
        file: target.filePath,
        revision: head,
      },
    ],
    evidenceSummary: `The live site read at ${observedAt} proved: ${finding.detail}`,
    evidenceLimitations:
      "Crawl directives control what Google may read, not what it chooses to index. Publication is not a ranking guarantee.",
    riskNote:
      "Operator review is required. Approval locks this exact robots.txt edit and source revision.",
    generationContext: {
      provider: "deterministic_site_audit",
      check,
      changeKind: target.changeKind,
      generatedAt: new Date().toISOString(),
    },
    sourceRepo: GOVERNED_REPO,
    sourceBranch: GOVERNED_BRANCH,
    sourceFile: target.filePath,
    sourceProjectId: GOVERNED_PROJECT_ID,
    sourceRevisionBefore: head,
  };
}

type RpcResult = { data: unknown; error: { message: string } | null };
type ServiceRpc = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };

export type ProposalMutationResult = {
  changeRequest: { id: string };
  changed: boolean;
};

/** File a prepared proposal through the one governed proposal writer. */
export async function fileGovernedProposal(input: {
  tenantId: string;
  actorId: string;
  idempotencyKey: string;
  proposal: PreparedProposal;
}): Promise<ProposalMutationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { proposal } = input;
  const result = await (supabaseAdmin as unknown as ServiceRpc).rpc("create_governed_proposal", {
    _tenant_id: input.tenantId,
    _actor: input.actorId,
    _idempotency_key: input.idempotencyKey,
    _proposal_type: proposal.proposalType,
    _target_url: proposal.targetUrl,
    _title: proposal.title,
    _changes: proposal.changes,
    _rationale: proposal.rationale,
    _evidence: proposal.evidence,
    _evidence_summary: proposal.evidenceSummary,
    _evidence_limitations: proposal.evidenceLimitations,
    _risk_note: proposal.riskNote,
    _generation_context: proposal.generationContext,
    _source_repo: proposal.sourceRepo,
    _source_branch: proposal.sourceBranch,
    _source_file: proposal.sourceFile,
    _source_project_id: proposal.sourceProjectId,
    _source_revision_before: proposal.sourceRevisionBefore,
  });
  if (result.error) throw new Error(result.error.message);
  const payload =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const change =
    payload["change_request"] && typeof payload["change_request"] === "object"
      ? (payload["change_request"] as Record<string, unknown>)
      : {};
  if (typeof change["id"] !== "string") {
    throw new Error("The proposal was filed without a readable proposal id.");
  }
  return { changeRequest: { id: change["id"] }, changed: payload["changed"] === true };
}
