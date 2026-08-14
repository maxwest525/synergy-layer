import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  GOVERNED_BRANCH,
  GOVERNED_FILE,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
} from "./execution/allowlist";
import { createGithubApi, createRenderedVerifier } from "./execution/execute.server";
import { applyExactReplacements, countOccurrences } from "./execution/source-change";
import { generateTitleH1Wording } from "./gemini.server";
import {
  assertCompleteEvidence,
  buildTitleH1Changes,
  buildTitleH1Prompt,
  requireProposalTarget,
  selectGscProposalEvidence,
  selectRelevantCompetitorEvidence,
  type CompetitorSnapshotInput,
  type GscSnapshotInput,
  type ProposalEvidence,
} from "./title-h1-proposals";

type Client = SupabaseClient<Database>;

export type PreparedTitleH1Proposal = {
  targetUrl: string;
  title: string;
  changes: ReturnType<typeof buildTitleH1Changes>;
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

function payloadRows(value: unknown): Record<string, unknown>[] {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Array.isArray(payload["rows"])
    ? (payload["rows"] as Record<string, unknown>[])
    : [];
}

function pageLabel(targetUrl: string): string {
  const path = new URL(targetUrl).pathname.replace(/^\/+|\/+$/g, "");
  return path ? path.split("/").at(-1)!.replace(/[-_]+/g, " ") : "homepage";
}

export async function prepareTitleH1Proposal(
  client: Client,
  tenantId: string,
  rawTargetUrl: string,
): Promise<PreparedTitleH1Proposal> {
  const targetUrl = requireProposalTarget(rawTargetUrl);
  const observedAt = new Date().toISOString();

  const renderer = createRenderedVerifier();
  if (!renderer) {
    throw new Error("Required live-page evidence is unavailable: FIRECRAWL_API_KEY is not configured.");
  }
  const rendered = await renderer.render(targetUrl);
  const livePage =
    rendered.title && rendered.heading
      ? {
          url: rendered.finalUrl,
          title: rendered.title,
          h1: rendered.heading,
          observedAt,
          renderedBy: rendered.renderedBy,
        }
      : null;

  const { data: gscSnapshots, error: gscError } = await client
    .from("search_console_snapshots")
    .select("period_start_pt, payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "page_query")
    .order("period_start_pt", { ascending: false })
    .limit(60);
  if (gscError) throw new Error(gscError.message);

  const gsc = selectGscProposalEvidence({
    targetUrl,
    snapshots: (gscSnapshots ?? []).map(
      (snapshot): GscSnapshotInput => ({
        periodStart: snapshot.period_start_pt,
        rows: payloadRows(snapshot.payload),
      }),
    ),
  });
  const queries = [...new Set(gsc.map((row) => row.query))].slice(0, 12);

  const { data: trackedRows, error: trackedError } = await client
    .from("tracked_competitors")
    .select("domain")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (trackedError) throw new Error(trackedError.message);

  let competitorSnapshots: CompetitorSnapshotInput[] = [];
  if (queries.length > 0) {
    const { data, error } = await client
      .from("dataforseo_snapshots")
      .select("target, payload, collected_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "serp_organic")
      .in("target", queries)
      .order("collected_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    competitorSnapshots = (data ?? []).map((snapshot) => ({
      target: snapshot.target,
      collectedAt: snapshot.collected_at,
      rows: payloadRows(snapshot.payload),
    }));
  }

  const competitors = selectRelevantCompetitorEvidence({
    gscQueries: queries,
    trackedDomains: (trackedRows ?? []).map((row) => row.domain),
    snapshots: competitorSnapshots,
  });
  const evidenceInput = { livePage, gsc, competitors };
  assertCompleteEvidence(evidenceInput);
  const evidence: ProposalEvidence = evidenceInput;

  const github = createGithubApi();
  if (!github) {
    throw new Error("An executable source baseline cannot be proven: GITHUB_EXECUTOR_TOKEN is not configured.");
  }
  const head = await github.branchHead(GOVERNED_REPO, GOVERNED_BRANCH);
  const source = await github.readFile(GOVERNED_REPO, GOVERNED_FILE, head);
  if (countOccurrences(source.content, evidence.livePage.title) !== 1) {
    throw new Error("The rendered live title is not one unique literal in the allowlisted source file.");
  }
  if (countOccurrences(source.content, evidence.livePage.h1) !== 1) {
    throw new Error("The rendered live H1 is not one unique literal in the allowlisted source file.");
  }

  const apiKey = process.env["GEMINI_API_KEY"] ?? "";
  const model = process.env["GEMINI_MODEL"] ?? "";
  const wording = await generateTitleH1Wording({
    apiKey,
    model,
    prompt: buildTitleH1Prompt(evidence),
  });
  const changes = buildTitleH1Changes(evidence.livePage, wording);
  const simulation = applyExactReplacements(source.content, changes);
  if (!simulation.ok || simulation.value.alreadyApplied) {
    throw new Error(
      simulation.ok
        ? "The proposed wording already exists in source, so no proposal was created."
        : simulation.reason,
    );
  }

  return {
    targetUrl,
    title: `Improve title and H1 for ${pageLabel(targetUrl)}`,
    changes,
    rationale: wording.rationale,
    evidence: [
      { source: "live_page", ...evidence.livePage },
      { source: "google_search_console", rows: evidence.gsc },
      { source: "dataforseo_competitors", rows: evidence.competitors },
    ],
    evidenceSummary: `The current rendered title and H1 were observed at ${observedAt}; ${evidence.gsc.length} exact-page GSC page/query rows and ${evidence.competitors.length} active-tracked-competitor DataForSEO organic rows informed the wording.`,
    evidenceLimitations:
      "Search Console rows are finalized historical observations, competitor rankings do not prove causation, and publication or performance improvement is not guaranteed.",
    riskNote: "Operator review is required. Approval locks the exact wording and source revision.",
    generationContext: {
      provider: "google_gemini_direct",
      model,
      generatedAt: new Date().toISOString(),
      evidenceClasses: ["live_page", "google_search_console", "dataforseo_competitors"],
      guidanceEntryIds: [],
    },
    sourceRepo: GOVERNED_REPO,
    sourceBranch: GOVERNED_BRANCH,
    sourceFile: GOVERNED_FILE,
    sourceProjectId: GOVERNED_PROJECT_ID,
    sourceRevisionBefore: head,
  };
}

export async function proveEditedWordingAgainstSource(input: {
  baseRevision: string;
  liveTitle: string;
  liveH1: string;
  seoTitle: string;
  h1: string;
  rationale: string;
}) {
  const github = createGithubApi();
  if (!github) throw new Error("GITHUB_EXECUTOR_TOKEN is not configured.");
  const head = await github.branchHead(GOVERNED_REPO, GOVERNED_BRANCH);
  if (head !== input.baseRevision) {
    throw new Error(
      `Revision drift: source is at ${head.slice(0, 10)} but this draft was based on ${input.baseRevision.slice(0, 10)}. Regenerate from fresh evidence.`,
    );
  }
  const source = await github.readFile(GOVERNED_REPO, GOVERNED_FILE, head);
  const changes = buildTitleH1Changes(
    {
      url: "",
      title: input.liveTitle,
      h1: input.liveH1,
      observedAt: "",
      renderedBy: "",
    },
    { seoTitle: input.seoTitle, h1: input.h1, rationale: input.rationale },
  );
  const simulation = applyExactReplacements(source.content, changes);
  if (!simulation.ok || simulation.value.alreadyApplied) {
    throw new Error(simulation.ok ? "The edited wording already exists in source." : simulation.reason);
  }
  return changes;
}
