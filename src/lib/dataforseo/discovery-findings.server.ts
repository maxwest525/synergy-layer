import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";
import { observationRecommendationRecord } from "../observation-record";
import { checksum } from "./transport.server";
import { normaliseDomain } from "./competitors.server";
import { collectWhoisOverview, type WhoisQuery } from "./domain-analytics.server";
import { countUnparsedMentionItems, selectMentions } from "./content-analysis.server";
import {
  checkIdenticalTechnologyStack,
  checkOverlapRowLimit,
  checkRivalPageMentions,
  checkUnlinkedBrandMentions,
  checkSameRegistrationDetails,
  domainsMissingWhoisRecord,
  domainsWithNoTechnologyRecorded,
  type DiscoveryFindingDraft,
  type RegistrationCandidateDraft,
  type TechnologyCandidateDraft,
  type TechnologyRow,
  type WhoisRow,
} from "./discovery-rule-checks";

type Client = SupabaseClient<Database>;

/**
 * Writers in this module read Labs (`labs_competitors_domain`), Content
 * Analysis (`content_analysis_mentions`) and Domain Analytics
 * (`whois_overview`, `domain_technologies`) snapshots that already exist and
 * turn them into either a finding (`recommendations`, source_module
 * "competitor-discovery" -- never "dataforseo": connections.registry.test.ts
 * asserts source_module "dataforseo" is written only by
 * dataforseo/targeting-rules.server.ts) or, for the two ownership rules, a
 * candidate for the operator to confirm or reject
 * (`domain_ownership_candidates`). Nothing here writes an ownership link:
 * COMPETITIVE_MODEL.md §4 and §7 are binding, and only an explicit operator
 * confirmation action -- outside this module -- may ever do that.
 */
export const MODULE = "competitor-discovery";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  const rows = asRecord(payload)?.["rows"];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

type SnapshotRow = {
  id: string;
  target: string;
  totals: unknown;
  payload: unknown;
  request_params: unknown;
  possibly_truncated: boolean;
  returned_row_count: number;
  reporting_date: string;
  collected_at: string;
};

/** Every stored snapshot of one kind, newest row first per distinct target. */
async function newestSnapshotsByTarget(
  client: Client,
  tenantId: string,
  kind: string,
): Promise<SnapshotRow[]> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select(
      "id, target, totals, payload, request_params, possibly_truncated, returned_row_count, reporting_date, collected_at",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .order("collected_at", { ascending: false });
  if (error) throw new Error(error.message);

  const byTarget = new Map<string, SnapshotRow>();
  for (const row of (data ?? []) as SnapshotRow[]) {
    if (!byTarget.has(row.target)) byTarget.set(row.target, row);
  }
  return [...byTarget.values()];
}

async function newestSnapshot(
  client: Client,
  tenantId: string,
  kind: string,
): Promise<SnapshotRow | null> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select(
      "id, target, totals, payload, request_params, possibly_truncated, returned_row_count, reporting_date, collected_at",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .order("collected_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as SnapshotRow | undefined) ?? null;
}

/**
 * Domains this tenant already knows about: active tracked competitors, plus
 * reviewed candidates classified as a competitor rather than a surface
 * (directory, marketplace, review site). A rejected candidate is a filed
 * operator decision that the domain is not one to watch, so it is excluded.
 */
async function readKnownCompetitorDomains(client: Client, tenantId: string): Promise<Set<string>> {
  const [trackedResult, candidateResult] = await Promise.all([
    client
      .from("tracked_competitors")
      .select("domain")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    client
      .from("competitor_candidates")
      .select("domain")
      .eq("tenant_id", tenantId)
      .eq("domain_class", "competitor")
      .neq("review_state", "rejected"),
  ]);
  if (trackedResult.error) throw new Error(trackedResult.error.message);
  if (candidateResult.error) throw new Error(candidateResult.error.message);

  const domains = new Set<string>();
  for (const row of trackedResult.data ?? []) domains.add(normaliseDomain(row.domain));
  for (const row of candidateResult.data ?? []) domains.add(normaliseDomain(row.domain));
  return domains;
}

/**
 * Files a `recommendations` row for a fact draft, skipping when an open
 * (non-terminal) recommendation already carries the same fingerprint --
 * checksum([tenantId, rule, target]), the same scheme
 * targeting-rules.server.ts and search-console-rules.server.ts use.
 */
async function fileFinding(
  client: Client,
  tenantId: string,
  draft: DiscoveryFindingDraft,
): Promise<number> {
  const issueFingerprint = checksum([tenantId, draft.rule, draft.target]);

  const { data: open, error: openError } = await client
    .from("recommendations")
    .select("id")
    .eq("issue_fingerprint", issueFingerprint)
    .not("state", "in", "(applied,verified,rejected,rolled_back)")
    .maybeSingle();
  if (openError) throw new Error(openError.message);
  if (open) return 0;

  const { error: insertError } = await client.from("recommendations").insert(
    observationRecommendationRecord({
      tenant_id: tenantId,
      title: draft.title,
      description: draft.description,
      // Literal, not the MODULE constant above: connections.registry.test.ts
      // scans server modules for this exact assignment pattern, written out,
      // to keep connections.ts honest about who writes a recommendation. A
      // variable reference here would slip past that scan silently.
      source_module: "competitor-discovery",
      business_impact: draft.businessImpact,
      time_saved_minutes: 0,
      risk: "none",
      confidence: draft.confidence,
      reasoning: `Rule ${draft.rule} over stored DataForSEO evidence.`,
      suggested_action: { kind: "review", rule: draft.rule, target: draft.target } as never,
      issue_fingerprint: issueFingerprint,
      metadata: { rule: draft.rule } as never,
    }),
  );
  if (insertError) throw new Error(`Discovery finding insert failed: ${insertError.message}`);
  return 1;
}

/**
 * Files (or leaves standing) one pending ownership candidate for the operator
 * to confirm or reject. `ignoreDuplicates` matches ad_advertiser_candidates:
 * a re-run must never reset a decision an operator already made by touching
 * `review_state` on an existing row.
 */
async function fileOwnershipCandidate(
  client: Client,
  tenantId: string,
  input: {
    rule: string;
    domainA: string;
    domainB: string;
    matchedFields: unknown;
    evidence: Record<string, unknown>;
  },
): Promise<number> {
  const [domainA, domainB] = [input.domainA, input.domainB].sort();
  const { error } = await client.from("domain_ownership_candidates").upsert(
    {
      tenant_id: tenantId,
      rule: input.rule,
      domain_a: domainA!,
      domain_b: domainB!,
      matched_fields: input.matchedFields as never,
      evidence: input.evidence as never,
      review_state: "pending",
    },
    { onConflict: "tenant_id,rule,domain_a,domain_b", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Ownership candidate insert failed: ${error.message}`);
  return 1;
}

// ---------------------------------------------------------------------------
// overlap_list_reached_the_row_limit
// ---------------------------------------------------------------------------

export async function runOverlapRowLimitFindings(
  client: Client,
  tenantId: string,
): Promise<{ findingsFiled: number }> {
  const snapshots = await newestSnapshotsByTarget(client, tenantId, "labs_competitors_domain");
  let filed = 0;
  for (const snapshot of snapshots) {
    const draft = checkOverlapRowLimit({
      target: snapshot.target,
      possiblyTruncated: snapshot.possibly_truncated,
      returnedRowCount: snapshot.returned_row_count,
      requestedLimit: asRecord(snapshot.request_params)?.["limit"],
    });
    if (draft) filed += await fileFinding(client, tenantId, draft);
  }
  return { findingsFiled: filed };
}

// ---------------------------------------------------------------------------
// rival_page_mentions_your_brand
// ---------------------------------------------------------------------------

export async function runRivalPageMentionFindings(
  client: Client,
  tenantId: string,
): Promise<{ findingsFiled: number; ran: boolean }> {
  const snapshot = await newestSnapshot(client, tenantId, "content_analysis_mentions");
  if (!snapshot) return { findingsFiled: 0, ran: false };

  const rawItems = rowsOf(snapshot.payload);
  const mentions = selectMentions(rawItems).map((mention) => ({
    url: mention.url,
    domain: mention.domain,
    title: mention.title,
    datePublished: mention.datePublished,
  }));
  const unparsedCount = countUnparsedMentionItems(rawItems);
  const knownDomains = await readKnownCompetitorDomains(client, tenantId);

  const drafts = checkRivalPageMentions({
    mentions,
    knownCompetitorDomains: knownDomains,
    unparsedCount,
    possiblyTruncated: snapshot.possibly_truncated,
  });

  let filed = 0;
  for (const draft of drafts) filed += await fileFinding(client, tenantId, draft);
  return { findingsFiled: filed, ran: true };
}

// ---------------------------------------------------------------------------
// brand_mentioned_without_a_link
// ---------------------------------------------------------------------------

/** Hosts of the tenant's own website assets, normalised the way the checks normalise. */
async function readOwnedHosts(client: Client, tenantId: string): Promise<Set<string>> {
  const { data, error } = await client
    .from("assets")
    .select("external_ref")
    .eq("tenant_id", tenantId)
    .eq("kind", "website");
  if (error) throw new Error(error.message);
  const hosts = new Set<string>();
  for (const row of data ?? []) {
    if (!row.external_ref) continue;
    try {
      hosts.add(normaliseDomain(new URL(row.external_ref).hostname));
    } catch {
      // A malformed stored asset is skipped rather than silently trusted.
    }
  }
  return hosts;
}

export type UnlinkedMentionRunResult = {
  findingsFiled: number;
  ran: boolean;
  /** Why the rule could not run, when it could not. */
  waitingOn: "brand_mention_collection" | "referring_domain_collection" | null;
};

/**
 * The set difference LINK-3 named: mention domains that are not in the newest
 * stored referring-domain read. Both reads must exist; without the link list
 * "without a link" is not a claim this system can make.
 */
export async function runUnlinkedBrandMentionFindings(
  client: Client,
  tenantId: string,
): Promise<UnlinkedMentionRunResult> {
  const mentionSnapshot = await newestSnapshot(client, tenantId, "content_analysis_mentions");
  if (!mentionSnapshot)
    return { findingsFiled: 0, ran: false, waitingOn: "brand_mention_collection" };
  const referringSnapshot = await newestSnapshot(client, tenantId, "backlinks_referring_domains");
  if (!referringSnapshot) {
    return { findingsFiled: 0, ran: false, waitingOn: "referring_domain_collection" };
  }

  const rawItems = rowsOf(mentionSnapshot.payload);
  const mentions = selectMentions(rawItems).map((mention) => ({
    url: mention.url,
    domain: mention.domain,
    title: mention.title,
    datePublished: mention.datePublished,
  }));
  const referringDomains = new Set<string>();
  for (const row of rowsOf(referringSnapshot.payload)) {
    const domain = normaliseDomain(String(row["domain"] ?? ""));
    if (domain) referringDomains.add(domain);
  }
  const requestedLimit = Number(asRecord(referringSnapshot.request_params)?.["limit"] ?? 0);

  const drafts = checkUnlinkedBrandMentions({
    mentions,
    ownedHosts: await readOwnedHosts(client, tenantId),
    knownCompetitorDomains: await readKnownCompetitorDomains(client, tenantId),
    referringDomains,
    referringDomainsReturned: referringSnapshot.returned_row_count,
    referringDomainsLimit: requestedLimit,
    referringDomainsReportingDate: referringSnapshot.reporting_date,
    referringDomainsPossiblyTruncated: referringSnapshot.possibly_truncated,
    unparsedCount: countUnparsedMentionItems(rawItems),
    mentionsPossiblyTruncated: mentionSnapshot.possibly_truncated,
  });

  let filed = 0;
  for (const draft of drafts) filed += await fileFinding(client, tenantId, draft);
  return { findingsFiled: filed, ran: true, waitingOn: null };
}

// ---------------------------------------------------------------------------
// same_registration_details_across_two_known_domains (operator DECISION)
// ---------------------------------------------------------------------------

/**
 * Operator-triggered producer: nothing calls `collectWhoisOverview` today, so
 * without this the rule below reads an empty table forever. Filters the
 * provider's registered-domain index down to exactly the tenant's tracked and
 * reviewed-competitor domains (digest §7's free server-side `in` filter), so
 * one call reads every known domain's registration record rather than
 * scanning the whole index.
 *
 * Exported and tested, but not wired to a workflow node or an operator
 * control yet -- see docs/context/BACKLOG.md and COMPETITIVE_MODEL.md for the
 * open gap. AGENTS.md requires metered calls on an operator click only, so
 * this must not be called from a schedule.
 */
export async function collectWhoisOverviewForKnownDomains(
  client: Client,
  tenantId: string,
  knownDomains: readonly string[],
  workflow?: { runId?: string | null; key?: string | null },
): ReturnType<typeof collectWhoisOverview> {
  const domains = [...new Set(knownDomains.map(normaliseDomain))].filter(
    (domain) => domain.length > 0,
  );
  if (domains.length === 0) {
    throw new Error("No tracked or reviewed competitor domain to read a whois record for.");
  }
  const query: WhoisQuery = {
    label: "known_domains",
    filters: [["domain", "in", domains]],
    limit: domains.length,
  };
  return collectWhoisOverview(client, tenantId, query, workflow);
}

function parseWhoisRows(items: readonly Record<string, unknown>[]): WhoisRow[] {
  return items
    .map((item) => ({
      domain: typeof item["domain"] === "string" ? item["domain"] : "",
      registrar: typeof item["registrar"] === "string" ? item["registrar"] : null,
      createdDatetime:
        typeof item["created_datetime"] === "string" ? item["created_datetime"] : null,
      expirationDatetime:
        typeof item["expiration_datetime"] === "string" ? item["expiration_datetime"] : null,
    }))
    .filter((row) => row.domain !== "");
}

export async function runSameRegistrationDetailsCandidates(
  client: Client,
  tenantId: string,
): Promise<{ candidatesFiled: number; ran: boolean; missingRecordFor: string[] }> {
  const knownDomains = [...(await readKnownCompetitorDomains(client, tenantId))];
  if (knownDomains.length < 2) return { candidatesFiled: 0, ran: false, missingRecordFor: [] };

  const snapshot = await newestSnapshot(client, tenantId, "whois_overview");
  if (!snapshot) return { candidatesFiled: 0, ran: false, missingRecordFor: knownDomains };

  const known = new Set(knownDomains);
  const rows = parseWhoisRows(rowsOf(snapshot.payload)).filter((row) =>
    known.has(normaliseDomain(row.domain)),
  );

  const candidates: RegistrationCandidateDraft[] = checkSameRegistrationDetails(rows);
  let filed = 0;
  for (const candidate of candidates) {
    filed += await fileOwnershipCandidate(client, tenantId, {
      rule: candidate.rule,
      domainA: candidate.domainA,
      domainB: candidate.domainB,
      matchedFields: candidate.matchedFields,
      evidence: {
        snapshotId: snapshot.id,
        collectedAt: snapshot.collected_at,
        reportingDate: snapshot.reporting_date,
      },
    });
  }

  return {
    candidatesFiled: filed,
    ran: true,
    missingRecordFor: domainsMissingWhoisRecord(knownDomains, rows),
  };
}

// ---------------------------------------------------------------------------
// identical_technology_stack_across_two_known_domains (operator DECISION)
// ---------------------------------------------------------------------------

export async function runIdenticalTechnologyStackCandidates(
  client: Client,
  tenantId: string,
): Promise<{ candidatesFiled: number; ran: boolean; noTechnologyRecordedFor: string[] }> {
  const knownDomains = await readKnownCompetitorDomains(client, tenantId);
  if (knownDomains.size < 2) return { candidatesFiled: 0, ran: false, noTechnologyRecordedFor: [] };

  const snapshots = await newestSnapshotsByTarget(client, tenantId, "domain_technologies");
  const rows: TechnologyRow[] = [];
  for (const snapshot of snapshots) {
    const domain = normaliseDomain(snapshot.target);
    if (!knownDomains.has(domain)) continue;

    const firstRow = rowsOf(snapshot.payload)[0];
    const rawTechnologies = firstRow?.["technologies"];
    const technologies =
      rawTechnologies !== null &&
      typeof rawTechnologies === "object" &&
      !Array.isArray(rawTechnologies)
        ? (rawTechnologies as Record<string, unknown>)
        : null;

    const totals = asRecord(snapshot.totals);
    const lastVisited =
      typeof totals?.["lastVisited"] === "string"
        ? (totals["lastVisited"] as string)
        : typeof firstRow?.["last_visited"] === "string"
          ? (firstRow["last_visited"] as string)
          : null;

    rows.push({ domain, technologies, lastVisited });
  }

  if (rows.length < 2) {
    return { candidatesFiled: 0, ran: true, noTechnologyRecordedFor: [] };
  }

  const candidates: TechnologyCandidateDraft[] = checkIdenticalTechnologyStack(rows);
  let filed = 0;
  for (const candidate of candidates) {
    filed += await fileOwnershipCandidate(client, tenantId, {
      rule: candidate.rule,
      domainA: candidate.domainA,
      domainB: candidate.domainB,
      matchedFields: [
        {
          sharedTechnologyCount: candidate.sharedTechnologyCount,
          cohortSize: candidate.cohortSize,
        },
      ],
      evidence: {
        lastVisitedA: candidate.lastVisitedA,
        lastVisitedB: candidate.lastVisitedB,
        freshness: candidate.freshness,
      },
    });
  }

  return {
    candidatesFiled: filed,
    ran: true,
    noTechnologyRecordedFor: domainsWithNoTechnologyRecorded(rows).map((row) => row.domain),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator -- the single entry point the registry module's workflow node calls.
// ---------------------------------------------------------------------------

export type CompetitorDiscoveryResult = {
  overlap: Awaited<ReturnType<typeof runOverlapRowLimitFindings>>;
  mentions: Awaited<ReturnType<typeof runRivalPageMentionFindings>>;
  unlinkedMentions: UnlinkedMentionRunResult;
  registrations: Awaited<ReturnType<typeof runSameRegistrationDetailsCandidates>>;
  technologies: Awaited<ReturnType<typeof runIdenticalTechnologyStackCandidates>>;
};

/**
 * Re-reads stored Labs, Content Analysis and Domain Analytics evidence and
 * files whatever the five rules find. Costs nothing: it calls no provider,
 * only Postgres.
 */
export async function runCompetitorDiscoveryFindings(
  client: Client,
  tenantId: string,
): Promise<CompetitorDiscoveryResult> {
  const overlap = await runOverlapRowLimitFindings(client, tenantId);
  const mentions = await runRivalPageMentionFindings(client, tenantId);
  const unlinkedMentions = await runUnlinkedBrandMentionFindings(client, tenantId);
  const registrations = await runSameRegistrationDetailsCandidates(client, tenantId);
  const technologies = await runIdenticalTechnologyStackCandidates(client, tenantId);

  await logActivity(client, {
    tenantId,
    verb: "discovery.competition_findings_evaluated",
    subjectKind: "capability",
    summary:
      `Competitor discovery rules: ${overlap.findingsFiled} overlap caveat(s), ` +
      `${mentions.findingsFiled} rival-mention finding(s), ${unlinkedMentions.findingsFiled} ` +
      `unlinked-mention finding(s), ${registrations.candidatesFiled} registration-match ` +
      `candidate(s), ${technologies.candidatesFiled} technology-stack candidate(s).`,
    payload: { overlap, mentions, unlinkedMentions, registrations, technologies } as never,
  });

  return { overlap, mentions, unlinkedMentions, registrations, technologies };
}
