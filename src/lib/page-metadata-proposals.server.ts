import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { PreparedProposal } from "./audit-fixes.server";
import {
  GOVERNED_BRANCH,
  GOVERNED_CHANGE_KINDS,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
} from "./execution/allowlist";
import { createGithubApi } from "./execution/execute.server";
import { readLivePageWording } from "./live-page-evidence.server";
import { applyExactReplacements } from "./execution/source-change";
import { generatePageMetadataWording } from "./gemini.server";
import { retrieveKnowledgeGuidance } from "./knowledge-retrieval.server";
import {
  buildPageMetadataChanges,
  buildPageMetadataPrompt,
  selectUniqueLiteralSource,
} from "./page-metadata-proposals";
import {
  assertCompleteEvidence,
  assertSameCanonicalProposalPage,
  requireProposalTarget,
  selectGscProposalEvidence,
  selectRelevantCompetitorEvidence,
  buildProposalEvidenceGroups,
  describeEvidenceMode,
  describeEvidenceRowsUsed,
  type CompetitorSnapshotInput,
  type EvidenceMode,
  type GscSnapshotInput,
  type ProposalEvidence,
  type ProposalOptionalContext,
} from "./title-h1-proposals";

type Client = SupabaseClient<Database>;

export type PreparedPageMetadataProposal = PreparedProposal;

/**
 * The allowlisted page.metadata file that carries the sitewide fallback
 * description. An edit binding here changes every page that does not set its
 * own description, so the proposal must say so.
 */
const SITEWIDE_DEFAULT_FILE: (typeof GOVERNED_CHANGE_KINDS)["page.metadata"][number] =
  "src/components/seo/DefaultSeo.tsx";

function payloadRows(value: unknown): Record<string, unknown>[] {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Array.isArray(payload["rows"]) ? (payload["rows"] as Record<string, unknown>[]) : [];
}

function pageLabel(targetUrl: string): string {
  const path = new URL(targetUrl).pathname.replace(/^\/+|\/+$/g, "");
  return path ? path.split("/").at(-1)!.replace(/[-_]+/g, " ") : "homepage";
}

export async function preparePageMetadataProposal(
  client: Client,
  tenantId: string,
  rawTargetUrl: string,
  options: { wordingMode?: "gemini"; evidenceMode?: EvidenceMode } = {},
): Promise<PreparedPageMetadataProposal> {
  const evidenceMode = options.evidenceMode ?? "wording";
  const targetUrl = requireProposalTarget(rawTargetUrl);
  const observedAt = new Date().toISOString();

  const rendered = await readLivePageWording({ client, tenantId, targetUrl });
  assertSameCanonicalProposalPage(targetUrl, rendered.finalUrl);
  const liveMetaDescription = rendered.metaDescription?.trim() ?? "";
  if (!liveMetaDescription) {
    // Unlike title and H1, the page audit does not store a meta description,
    // so this one lane cannot fall back to the stored reading and says so
    // rather than reporting the generic absence.
    throw new Error(
      rendered.fromStoredAudit
        ? "This page's description can only be drafted from a live read, because the page audit stores a title and H1 but not a description. Restore a renderer, or draft the title and heading instead."
        : "Required live meta description evidence is missing: the rendered page served no description to change.",
    );
  }
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
    snapshots: (gscSnapshots ?? []).map((snapshot): GscSnapshotInput => ({
      periodStart: snapshot.period_start_pt,
      rows: payloadRows(snapshot.payload),
    })),
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

  let competitors = selectRelevantCompetitorEvidence({
    gscQueries: queries,
    trackedDomains: (trackedRows ?? []).map((row) => row.domain),
    snapshots: competitorSnapshots,
  });

  // Exact query snapshots are preferred. If none contains usable evidence,
  // inspect recent organic snapshots and let the strict related-query matcher
  // admit only substantially overlapping search intent.
  if (queries.length > 0 && competitors.length === 0) {
    const { data, error } = await client
      .from("dataforseo_snapshots")
      .select("target, payload, collected_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "serp_organic")
      .order("collected_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    competitorSnapshots = (data ?? []).map((snapshot) => ({
      target: snapshot.target,
      collectedAt: snapshot.collected_at,
      rows: payloadRows(snapshot.payload),
    }));
    competitors = selectRelevantCompetitorEvidence({
      gscQueries: queries,
      trackedDomains: (trackedRows ?? []).map((row) => row.domain),
      snapshots: competitorSnapshots,
    });
  }

  const evidenceInput = { livePage, gsc, competitors };
  assertCompleteEvidence(evidenceInput, evidenceMode);
  const evidence: ProposalEvidence = evidenceInput;
  const competitorEvidenceMode = evidence.competitors.some(
    (row) => row.query.trim().toLowerCase() !== row.matchedGscQuery.trim().toLowerCase(),
  )
    ? "related_query_fallback"
    : "exact_query";

  // Optional sources enrich/corroborate the wording brief but never gate proposal eligibility.
  const [
    { data: ga4Rows, error: ga4Error },
    { data: transparencyRows, error: transparencyError },
    { data: paidRows, error: paidError },
  ] = await Promise.all([
    client
      .from("ga4_snapshots")
      .select("id,start_date,end_date,metrics,provenance,collected_at")
      .eq("tenant_id", tenantId)
      .order("collected_at", { ascending: false })
      .limit(20),
    client
      .from("ad_creatives")
      .select(
        "id,headline,long_headline,snippet,call_to_action,target_domain,first_shown,last_shown,retrieved_at,source_url,content_checksum",
      )
      .eq("tenant_id", tenantId)
      .order("retrieved_at", { ascending: false })
      .limit(30),
    queries.length
      ? client
          .from("ad_live_serp_observations")
          .select(
            "id,keyword,reporting_date,ad_count,ads_payload,source_url,request_fingerprint,observed_at",
          )
          .eq("tenant_id", tenantId)
          .in("keyword", queries)
          .order("observed_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ga4Error) throw new Error(ga4Error.message);
  if (transparencyError) throw new Error(transparencyError.message);
  if (paidError) throw new Error(paidError.message);
  const exactGa4 = (ga4Rows ?? []).filter((row) => {
    const metrics =
      row.metrics && typeof row.metrics === "object" && !Array.isArray(row.metrics)
        ? (row.metrics as Record<string, unknown>)
        : {};
    return metrics["targetUrl"] === targetUrl || metrics["pageLocation"] === targetUrl;
  });
  const optionalContext: ProposalOptionalContext = {
    ga4: {
      status: exactGa4.length ? "available" : "missing",
      rows: exactGa4,
      provenance: {
        scope: "exact page behavioral baseline/event inventory",
        note: exactGa4.length
          ? "measurement only"
          : "No exact-page GA4 snapshot is available; generation continues.",
      },
    },
    serpapiTransparency: {
      status: transparencyRows?.length ? "available" : "missing",
      rows: transparencyRows ?? [],
      provenance: { scope: "paid creative history", note: "corroboration only" },
    },
    serpapiPaidSerp: {
      status: paidRows?.length ? "available" : "missing",
      rows: paidRows ?? [],
      provenance: { scope: "live paid SERP for exact GSC queries", note: "corroboration only" },
    },
    contradictionFlags: [],
  };

  const github = createGithubApi();
  if (!github) {
    throw new Error(
      "An executable source baseline cannot be proven: GITHUB_EXECUTOR_TOKEN is not configured.",
    );
  }
  const head = await github.branchHead(GOVERNED_REPO, GOVERNED_BRANCH);
  const sources = await Promise.all(
    GOVERNED_CHANGE_KINDS["page.metadata"].map(async (path) => ({
      path,
      content: (await github.readFile(GOVERNED_REPO, path, head)).content,
    })),
  );
  const source = selectUniqueLiteralSource(sources, liveMetaDescription);
  const sitewideDefault = source.path === SITEWIDE_DEFAULT_FILE;

  const guidance = (
    await retrieveKnowledgeGuidance(client, [targetUrl, ...queries].join(" "), { limit: 5 })
  ).map((entry) => ({
    id: entry.id,
    title: entry.title,
    excerpt: entry.excerpt.slice(0, 600),
    sourceRef: entry.sourceRef,
  }));

  const wordingMode = options.wordingMode ?? "gemini";
  const apiKey = process.env["GEMINI_API_KEY"] ?? "";
  const model = process.env["GEMINI_MODEL"] ?? "";
  const wording = await generatePageMetadataWording({
    apiKey,
    model,
    prompt: buildPageMetadataPrompt(
      { ...evidence, liveMetaDescription },
      guidance,
      optionalContext,
    ),
  });
  const changes = buildPageMetadataChanges(liveMetaDescription, wording);
  const simulation = applyExactReplacements(source.content, changes);
  if (!simulation.ok || simulation.value.alreadyApplied) {
    throw new Error(
      simulation.ok
        ? "The proposed wording already exists in source, so no proposal was created."
        : simulation.reason,
    );
  }

  return {
    proposalType: "page_metadata",
    targetUrl,
    title: sitewideDefault
      ? `Improve the sitewide default meta description (rendered on ${pageLabel(targetUrl)})`
      : `Improve meta description for ${pageLabel(targetUrl)}`,
    changes: changes as unknown as Record<string, unknown>[],
    rationale: wording.rationale,
    evidence: [
      {
        source: "live_meta_description",
        role: "source_of_truth",
        url: rendered.finalUrl,
        metaDescription: liveMetaDescription,
        observedAt,
        renderedBy: rendered.renderedBy,
      },
      ...buildProposalEvidenceGroups(
        evidence,
        optionalContext,
        guidance,
        competitorEvidenceMode,
        evidenceMode,
      ),
    ],
    evidenceSummary: `The current rendered meta description was observed at ${observedAt}; ${describeEvidenceRowsUsed(evidence, competitorEvidenceMode)} ${describeEvidenceMode(evidenceMode)}`,
    evidenceLimitations:
      "Search Console rows are finalized historical observations, competitor rankings do not prove causation, and publication or performance improvement is not guaranteed.",
    riskNote: sitewideDefault
      ? "Operator review is required. The current wording lives in the sitewide default, so this one edit changes the meta description of every page that does not set its own. Approval locks the exact wording and source revision."
      : "Operator review is required. Approval locks the exact wording and source revision.",
    generationContext: {
      provider: "google_gemini_direct",
      model,
      wordingMode,
      evidenceMode,
      generatedAt: new Date().toISOString(),
      editScope: sitewideDefault ? "sitewide_default" : "single_page",
      competitorEvidenceMode,
      sourceRoles: {
        live_page: "source_of_truth",
        google_search_console: "source_of_truth",
        ga4: "source_of_truth",
        dataforseo_competitors: "enrichment",
        serpapi_transparency: "corroboration",
        serpapi_paid_serp: "corroboration",
        knowledge: "devils_advocate",
      },
      optionalSourceStatus: {
        ga4: optionalContext.ga4.status,
        serpapiTransparency: optionalContext.serpapiTransparency.status,
        serpapiPaidSerp: optionalContext.serpapiPaidSerp.status,
      },
      contradictionFlags: optionalContext.contradictionFlags,
      guidanceEntryIds: guidance.map((entry) => entry.id),
      guidanceSourceRefs: guidance.map((entry) => entry.sourceRef).filter(Boolean),
    },
    sourceRepo: GOVERNED_REPO,
    sourceBranch: GOVERNED_BRANCH,
    sourceFile: source.path,
    sourceProjectId: GOVERNED_PROJECT_ID,
    sourceRevisionBefore: head,
  };
}
