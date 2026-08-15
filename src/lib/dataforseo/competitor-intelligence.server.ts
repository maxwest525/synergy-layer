import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Competitor intelligence is a second, deeper pass over the SERP evidence AOOS
 * already paid for. It calls no provider and invents no metric: every number
 * below is recomputed from stored `serp_organic` snapshots.
 *
 * Ranking is not the same thing as competing. A domain that appears in the
 * results is a ranking domain; whether it is a business competing for the same
 * customer stays an explicitly uncertain judgement, carried as a confidence
 * score and a classification note rather than asserted.
 */
export const COMPETITOR_INTELLIGENCE_CONFIG = {
  lookbackDays: 30,
  maxRankConsidered: 20,
  /** Distinct approved keywords a domain must appear for to be profiled. */
  minKeywordAppearances: 2,
  /** How many domains reach deeper page-level observation. */
  shortlistSize: 6,
  /** A shortlisted domain must clear this composite significance score. */
  minShortlistScore: 18,
} as const;

export type CompetitorProfile = {
  domain: string;
  domainClass: "competitor" | "surface";
  keywordsObserved: number;
  serpsPresent: number;
  serpShare: number;
  keywords: string[];
  bestPosition: number;
  averagePosition: number;
  medianPosition: number;
  outranksOwned: { keyword: string; competitorPosition: number; ownedPosition: number | null }[];
  ownedOutranks: { keyword: string; competitorPosition: number; ownedPosition: number }[];
  ownedAbsentWhilePresent: string[];
  serpFeatures: string[];
  topUrls: { keyword: string; url: string; position: number; title: string }[];
  significanceScore: number;
  confidence: number;
  confidenceBasis: string[];
  classificationCertainty: "heuristic";
  shortlisted: boolean;
  shortlistReason: string | null;
};

export type CompetitorIntelligenceResult = {
  ownDomain: string;
  serpsAnalysed: number;
  domainsProfiled: number;
  competitorProfiles: number;
  surfaceProfiles: number;
  shortlist: string[];
  ownedPresentInSerps: number;
  ownedAbsentSerps: string[];
  costUsd: 0;
};

function normaliseDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  const lower = sorted[mid - 1] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

type SerpRow = Record<string, unknown>;

type ParsedSerp = {
  keyword: string;
  snapshotId: string;
  organic: Map<string, { position: number; url: string; title: string }>;
  features: string[];
};

/** Re-reads stored SERP snapshots into a per-keyword structure. Costs nothing. */
async function readSerpEvidence(client: Client, tenantId: string): Promise<ParsedSerp[]> {
  const cutoff = new Date(Date.now() - COMPETITOR_INTELLIGENCE_CONFIG.lookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("id, target, payload, reporting_date")
    .eq("tenant_id", tenantId)
    .eq("kind", "serp_organic")
    .gte("reporting_date", cutoff)
    .order("reporting_date", { ascending: false });
  if (error) throw new Error(error.message);

  const byKeyword = new Map<string, ParsedSerp>();

  for (const snapshot of data ?? []) {
    // Newest snapshot per keyword wins: an older observation of the same
    // keyword is history, not a second competitive signal.
    if (byKeyword.has(snapshot.target)) continue;

    const rows = (snapshot.payload as { rows?: SerpRow[] } | null)?.rows ?? [];
    const organic = new Map<string, { position: number; url: string; title: string }>();
    const features = new Set<string>();

    for (const row of rows) {
      const type = String(row["type"] ?? "");
      if (type && type !== "organic") features.add(type);
      if (type !== "organic") continue;

      const position = Number(row["rank_group"] ?? row["rank_absolute"] ?? 0);
      if (!position || position > COMPETITOR_INTELLIGENCE_CONFIG.maxRankConsidered) continue;
      const domain = normaliseDomain(String(row["domain"] ?? ""));
      if (!domain) continue;
      // Best slot per domain per SERP.
      const existing = organic.get(domain);
      if (existing && existing.position <= position) continue;
      organic.set(domain, {
        position,
        url: String(row["url"] ?? ""),
        title: String(row["title"] ?? ""),
      });
    }

    byKeyword.set(snapshot.target, {
      keyword: snapshot.target,
      snapshotId: snapshot.id,
      organic,
      features: [...features],
    });
  }

  return [...byKeyword.values()];
}

/**
 * Builds an evidence-backed profile for every domain observed in the stored
 * SERPs, then selects a small shortlist for deeper observation. Nothing is
 * promoted to a tracked competitor here: the shortlist is a review queue.
 */
export async function buildCompetitorProfiles(
  client: Client,
  tenantId: string,
  ownDomain: string,
): Promise<{ result: CompetitorIntelligenceResult; profiles: CompetitorProfile[] }> {
  const own = normaliseDomain(ownDomain);
  const serps = await readSerpEvidence(client, tenantId);

  if (serps.length === 0) {
    return {
      result: {
        ownDomain: own,
        serpsAnalysed: 0,
        domainsProfiled: 0,
        competitorProfiles: 0,
        surfaceProfiles: 0,
        shortlist: [],
        ownedPresentInSerps: 0,
        ownedAbsentSerps: [],
        costUsd: 0,
      },
      profiles: [],
    };
  }

  // Existing classification is authoritative: this pass enriches the candidate
  // rows the derivation step produced, it never reclassifies them.
  const { data: existing, error: existingError } = await client
    .from("competitor_candidates")
    .select("id, domain, domain_class, metrics, review_state")
    .eq("tenant_id", tenantId)
    .eq("seed_domain", own);
  if (existingError) throw new Error(existingError.message);

  const classByDomain = new Map<string, "competitor" | "surface">();
  const idByDomain = new Map<string, string>();
  const metricsByDomain = new Map<string, Record<string, unknown>>();
  const reviewStateByDomain = new Map<string, string>();
  for (const row of existing ?? []) {
    classByDomain.set(row.domain, (row.domain_class as "competitor" | "surface") ?? "competitor");
    idByDomain.set(row.domain, row.id);
    metricsByDomain.set(row.domain, (row.metrics ?? {}) as Record<string, unknown>);
    reviewStateByDomain.set(row.domain, row.review_state);
  }

  const domains = new Set<string>();
  for (const serp of serps)
    for (const domain of serp.organic.keys()) if (domain !== own) domains.add(domain);

  const ownedAbsentSerps = serps
    .filter((serp) => !serp.organic.has(own))
    .map((serp) => serp.keyword);
  const ownedPresentInSerps = serps.length - ownedAbsentSerps.length;

  const profiles: CompetitorProfile[] = [];

  for (const domain of domains) {
    const keywords: string[] = [];
    const positions: number[] = [];
    const outranksOwned: CompetitorProfile["outranksOwned"] = [];
    const ownedOutranks: CompetitorProfile["ownedOutranks"] = [];
    const ownedAbsentWhilePresent: string[] = [];
    const features = new Set<string>();
    const topUrls: CompetitorProfile["topUrls"] = [];

    for (const serp of serps) {
      const hit = serp.organic.get(domain);
      if (!hit) continue;
      keywords.push(serp.keyword);
      positions.push(hit.position);
      for (const feature of serp.features) features.add(feature);
      topUrls.push({
        keyword: serp.keyword,
        url: hit.url,
        position: hit.position,
        title: hit.title,
      });

      const ownHit = serp.organic.get(own);
      if (!ownHit) {
        ownedAbsentWhilePresent.push(serp.keyword);
        outranksOwned.push({
          keyword: serp.keyword,
          competitorPosition: hit.position,
          ownedPosition: null,
        });
      } else if (hit.position < ownHit.position) {
        outranksOwned.push({
          keyword: serp.keyword,
          competitorPosition: hit.position,
          ownedPosition: ownHit.position,
        });
      } else {
        ownedOutranks.push({
          keyword: serp.keyword,
          competitorPosition: hit.position,
          ownedPosition: ownHit.position,
        });
      }
    }

    if (keywords.length < COMPETITOR_INTELLIGENCE_CONFIG.minKeywordAppearances) continue;

    const serpShare = keywords.length / serps.length;
    const averagePosition = positions.reduce((total, value) => total + value, 0) / positions.length;
    const medianPosition = median(positions);
    const bestPosition = Math.min(...positions);
    const outrankShare = outranksOwned.length / keywords.length;
    // Top-10 presence is worth more than deep-page presence.
    const positionStrength = Math.max(0, (11 - Math.min(medianPosition, 11)) / 10);

    const significanceScore = round(55 * serpShare + 25 * outrankShare + 20 * positionStrength, 1);

    const confidenceBasis: string[] = [
      `Observed in ${keywords.length} of ${serps.length} approved-keyword SERPs.`,
      `Median organic position ${round(medianPosition, 1)} across ${positions.length} observations.`,
    ];
    let confidence =
      0.35 + 0.35 * Math.min(serpShare * 2, 1) + 0.15 * Math.min(keywords.length / 10, 1);
    if (classByDomain.get(domain) === "surface") {
      confidence = Math.min(confidence, 0.4);
      confidenceBasis.push(
        "Classified as a search surface, not a business competitor: presence reflects platform reach.",
      );
    } else {
      confidenceBasis.push(
        "Classified as a business-competitor candidate by heuristic only. Ranking alongside TruMove is not proof of the same service offer or service area.",
      );
    }
    if (keywords.length < 4) {
      confidenceBasis.push("Thin evidence: fewer than four observed SERPs.");
    }

    profiles.push({
      domain,
      domainClass: classByDomain.get(domain) ?? "competitor",
      keywordsObserved: serps.length,
      serpsPresent: keywords.length,
      serpShare: round(serpShare, 3),
      keywords: keywords.slice(0, 40),
      bestPosition,
      averagePosition: round(averagePosition, 2),
      medianPosition: round(medianPosition, 2),
      outranksOwned: outranksOwned.slice(0, 40),
      ownedOutranks: ownedOutranks.slice(0, 40),
      ownedAbsentWhilePresent: ownedAbsentWhilePresent.slice(0, 40),
      serpFeatures: [...features].sort(),
      topUrls: [...topUrls].sort((a, b) => a.position - b.position).slice(0, 5),
      significanceScore,
      confidence: round(Math.min(confidence, 0.9), 2),
      confidenceBasis,
      classificationCertainty: "heuristic",
      shortlisted: false,
      shortlistReason: null,
    });
  }

  profiles.sort((a, b) => b.significanceScore - a.significanceScore);

  // Only business-competitor candidates are eligible for deeper observation:
  // inspecting a directory page teaches nothing about a rival's offer.
  const eligible = profiles.filter(
    (profile) =>
      profile.domainClass === "competitor" &&
      profile.significanceScore >= COMPETITOR_INTELLIGENCE_CONFIG.minShortlistScore,
  );
  for (const profile of eligible.slice(0, COMPETITOR_INTELLIGENCE_CONFIG.shortlistSize)) {
    profile.shortlisted = true;
    profile.shortlistReason = `Present in ${profile.serpsPresent} of ${profile.keywordsObserved} observed SERPs (${Math.round(profile.serpShare * 100)}% share), outranks TruMove on ${profile.outranksOwned.length}, median position ${profile.medianPosition}.`;
  }

  for (const profile of profiles) {
    const priorMetrics = metricsByDomain.get(profile.domain) ?? {};
    const payload = {
      ...priorMetrics,
      derived_from: "observed_serp_results",
      estimated: false,
      intelligence_pass: {
        generated_at: new Date().toISOString(),
        serps_analysed: profile.keywordsObserved,
        serps_present: profile.serpsPresent,
        serp_share: profile.serpShare,
        keywords: profile.keywords,
        best_position: profile.bestPosition,
        average_position: profile.averagePosition,
        median_position: profile.medianPosition,
        outranks_owned: profile.outranksOwned,
        owned_outranks: profile.ownedOutranks,
        owned_absent_while_present: profile.ownedAbsentWhilePresent,
        owned_absent_serps: ownedAbsentSerps.slice(0, 60),
        owned_present_in_serps: ownedPresentInSerps,
        serp_features: profile.serpFeatures,
        top_urls: profile.topUrls,
        significance_score: profile.significanceScore,
        confidence: profile.confidence,
        confidence_basis: profile.confidenceBasis,
        classification_certainty: profile.classificationCertainty,
        shortlisted: profile.shortlisted,
        shortlist_reason: profile.shortlistReason,
      },
    };

    const id = idByDomain.get(profile.domain);
    if (id) {
      const update: { metrics: never; review_state?: "pending" } = { metrics: payload as never };
      if (profile.shortlisted && reviewStateByDomain.get(profile.domain) === "discovered") {
        update.review_state = "pending";
      }
      const { error } = await client.from("competitor_candidates").update(update).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from("competitor_candidates").upsert(
        {
          tenant_id: tenantId,
          seed_domain: own,
          domain: profile.domain,
          source: "serp.derived",
          domain_class: profile.domainClass,
          review_state: profile.shortlisted ? "pending" : "discovered",
          metrics: payload as never,
        },
        { onConflict: "tenant_id,seed_domain,domain,source", ignoreDuplicates: false },
      );
      if (error) throw new Error(error.message);
    }
  }

  const shortlisted = profiles.filter((profile) => profile.shortlisted);
  const completedAt = new Date().toISOString();
  await client
    .from("inbox_items")
    .update({ lane: "completed", resolved_at: completedAt })
    .eq("tenant_id", tenantId)
    .eq("source_module", "workflows")
    .ilike("title", "%competitor intelligence%failed%")
    .is("resolved_at", null);
  if (shortlisted.length > 0) {
    const { fileInboxItem, logActivity } = await import("../os.server");
    const { data: openItem } = await client
      .from("inbox_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_module", "competitor-intelligence")
      .is("resolved_at", null)
      .maybeSingle();

    if (!openItem) {
      await fileInboxItem(client, {
        tenantId,
        lane: "pending_approval",
        sourceModule: "competitor-intelligence",
        title: `${shortlisted.length} competitors shortlisted for review`,
        summary: `Profiled ${profiles.length} domains observed across ${serps.length} approved-keyword SERPs. ${shortlisted.length} business-competitor candidates cleared the significance threshold. None are tracked until you approve them.`,
        priority: 2,
        subjectKind: "competitor_candidate",
        actions: [{ kind: "review", href: "/competitors" }],
      });
    } else {
      await client
        .from("inbox_items")
        .update({
          lane: "pending_approval",
          title: `${shortlisted.length} competitors shortlisted for review`,
          summary: `Profiled ${profiles.length} domains observed across ${serps.length} approved-keyword SERPs. ${shortlisted.length} business-competitor candidates cleared the significance threshold. None are tracked until you approve them.`,
          actions: [{ kind: "review", href: "/competitors" }] as never,
        })
        .eq("id", openItem.id);
    }

    await logActivity(client, {
      tenantId,
      verb: "competitor.intelligence.completed",
      subjectKind: "capability",
      summary: `Competitor intelligence profiled ${profiles.length} observed domains and shortlisted ${shortlisted.length} for review.`,
      payload: {
        serpsAnalysed: serps.length,
        shortlist: shortlisted.map((profile) => profile.domain),
        ownedAbsentSerps: ownedAbsentSerps.length,
      },
    });
  }

  return {
    result: {
      ownDomain: own,
      serpsAnalysed: serps.length,
      domainsProfiled: profiles.length,
      competitorProfiles: profiles.filter((p) => p.domainClass === "competitor").length,
      surfaceProfiles: profiles.filter((p) => p.domainClass === "surface").length,
      shortlist: profiles.filter((p) => p.shortlisted).map((p) => p.domain),
      ownedPresentInSerps,
      ownedAbsentSerps,
      costUsd: 0,
    },
    profiles,
  };
}

/** Reads back the stored profiles without recomputing them. */
export async function readCompetitorProfiles(
  client: Client,
  tenantId: string,
): Promise<
  {
    id: string;
    domain: string;
    domainClass: string;
    reviewState: string;
    intelligence: Record<string, unknown> | null;
    pageEvidence: Record<string, unknown> | null;
  }[]
> {
  const { data, error } = await client
    .from("competitor_candidates")
    .select("id, domain, domain_class, review_state, metrics")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      domain: row.domain,
      domainClass: row.domain_class,
      reviewState: row.review_state,
      intelligence: (metrics["intelligence_pass"] as Record<string, unknown>) ?? null,
      pageEvidence: (metrics["page_evidence"] as Record<string, unknown>) ?? null,
    };
  });
}

/**
 * Rebuilds the shortlisted profiles from stored candidate rows so a later node
 * can inspect them without recomputing or re-observing anything.
 */
export async function readShortlistedProfiles(
  client: Client,
  tenantId: string,
): Promise<CompetitorProfile[]> {
  const { data, error } = await client
    .from("competitor_candidates")
    .select("domain, domain_class, metrics")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  const profiles: CompetitorProfile[] = [];
  for (const row of data ?? []) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    const pass = metrics["intelligence_pass"] as Record<string, unknown> | undefined;
    if (!pass || !pass["shortlisted"]) continue;
    profiles.push({
      domain: row.domain,
      domainClass: (row.domain_class as "competitor" | "surface") ?? "competitor",
      keywordsObserved: Number(pass["serps_analysed"] ?? 0),
      serpsPresent: Number(pass["serps_present"] ?? 0),
      serpShare: Number(pass["serp_share"] ?? 0),
      keywords: (pass["keywords"] ?? []) as string[],
      bestPosition: Number(pass["best_position"] ?? 0),
      averagePosition: Number(pass["average_position"] ?? 0),
      medianPosition: Number(pass["median_position"] ?? 0),
      outranksOwned: (pass["outranks_owned"] ?? []) as CompetitorProfile["outranksOwned"],
      ownedOutranks: (pass["owned_outranks"] ?? []) as CompetitorProfile["ownedOutranks"],
      ownedAbsentWhilePresent: (pass["owned_absent_while_present"] ?? []) as string[],
      serpFeatures: (pass["serp_features"] ?? []) as string[],
      topUrls: (pass["top_urls"] ?? []) as CompetitorProfile["topUrls"],
      significanceScore: Number(pass["significance_score"] ?? 0),
      confidence: Number(pass["confidence"] ?? 0),
      confidenceBasis: (pass["confidence_basis"] ?? []) as string[],
      classificationCertainty: "heuristic",
      shortlisted: true,
      shortlistReason: (pass["shortlist_reason"] as string) ?? null,
    });
  }
  return profiles;
}
