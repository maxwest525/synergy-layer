import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  collectAnchors,
  collectBacklinkHistory,
  collectBacklinkSummary,
  collectBacklinks,
  collectReferringDomains,
  collectTopLinkedPages,
} from "./backlinks.server";
import {
  ANCHOR_DEFAULTS,
  HEALTH_FACTORS,
  STRATEGY_SOURCE,
  TOXIC_DEFAULTS,
  scoreBacklinkHealth,
  type HealthFactorScore,
} from "./backlink-strategy";
import { fingerprint, persistSnapshot } from "./transport.server";

type Client = SupabaseClient<Database>;

/**
 * Normalized backlink evidence.
 *
 * This module deliberately produces no recommendations. It reads the provider
 * evidence AOOS already paid for, reshapes it into the factors the imported
 * claude-seo methodology reasons about, and records which factors still have
 * no data. Heuristic thresholds are carried as context only: nothing here
 * turns a threshold into a judgement.
 */

const CAPABILITY = "cap.dataforseo_backlinks";

type Row = Record<string, unknown>;

async function rowsOf(client: Client, snapshotId: string): Promise<Row[]> {
  const { data } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .single();
  return ((data?.payload as { rows?: Row[] } | null)?.rows ?? []);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function classifyAnchor(anchor: string, brandTokens: string[]): string {
  const value = anchor.trim().toLowerCase();
  if (!value) return "empty";
  if (/^https?:\/\//.test(value) || /^www\./.test(value) || /\.[a-z]{2,}\/?$/.test(value)) return "naked";
  if (brandTokens.some((token) => value.includes(token))) return "branded";
  if (["click here", "here", "read more", "website", "link", "visit", "this site"].includes(value)) {
    return "generic";
  }
  return "topical";
}

export type BacklinkEvidence = {
  target: string;
  collectedAt: string;
  costUsd: number;
  factors: HealthFactorScore[];
  missingFactors: string[];
  health: ReturnType<typeof scoreBacklinkHealth>;
  normalized: Record<string, unknown>;
};

/**
 * Runs the full owned-property backlink evidence pass and stores the
 * normalized result as an immutable derived snapshot.
 */
export async function collectBacklinkEvidence(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<BacklinkEvidence> {
  let costUsd = 0;

  const summary = await collectBacklinkSummary(client, tenantId, target, workflow);
  const domains = await collectReferringDomains(client, tenantId, target, workflow);
  const links = await collectBacklinks(client, tenantId, target, workflow);
  const anchors = await collectAnchors(client, tenantId, target, workflow);
  const pages = await collectTopLinkedPages(client, tenantId, target, workflow);
  const history = await collectBacklinkHistory(client, tenantId, target, workflow);
  costUsd =
    summary.costUsd + domains.costUsd + links.costUsd + anchors.costUsd + pages.costUsd + history.costUsd;

  const summaryRow = (await rowsOf(client, summary.snapshotId))[0] ?? {};
  const domainRows = await rowsOf(client, domains.snapshotId);
  const linkRows = await rowsOf(client, links.snapshotId);
  const anchorRows = await rowsOf(client, anchors.snapshotId);
  const pageRows = await rowsOf(client, pages.snapshotId);
  const historyRows = await rowsOf(client, history.snapshotId);

  const brandTokens = target
    .replace(/\.[a-z.]+$/, "")
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4)
    .map((token) => token.toLowerCase());

  // Anchor distribution
  const anchorTotals = new Map<string, number>();
  let anchorBacklinks = 0;
  for (const row of anchorRows) {
    const anchor = String(row["anchor"] ?? "");
    const count = num(row["backlinks"]) ?? 0;
    anchorBacklinks += count;
    const bucket = classifyAnchor(anchor, brandTokens);
    anchorTotals.set(bucket, (anchorTotals.get(bucket) ?? 0) + count);
  }
  const anchorDistribution = Object.fromEntries(
    [...anchorTotals.entries()].map(([bucket, count]) => [
      bucket,
      { backlinks: count, share: anchorBacklinks > 0 ? Number((count / anchorBacklinks).toFixed(4)) : null },
    ]),
  );

  // Referring-domain quality and toxicity
  const spamScores = domainRows.map((row) => num(row["backlinks_spam_score"]) ?? num(row["spam_score"])).filter(
    (value): value is number => value !== null,
  );
  const flagged = domainRows.filter((row) => {
    const spam = num(row["backlinks_spam_score"]) ?? num(row["spam_score"]) ?? 0;
    return spam >= TOXIC_DEFAULTS.spamScoreFlag;
  });
  const ranks = domainRows.map((row) => num(row["rank"])).filter((value): value is number => value !== null);

  const followCounts = linkRows.reduce<{ dofollow: number; nofollow: number }>(
    (acc, row) => {
      if (row["dofollow"] === true) return { ...acc, dofollow: acc.dofollow + 1 };
      if (row["dofollow"] === false) return { ...acc, nofollow: acc.nofollow + 1 };
      return acc;
    },
    { dofollow: 0, nofollow: 0 },
  );

  const countries = new Map<string, number>();
  for (const row of domainRows) {
    const country = String(row["country"] ?? "unknown").toLowerCase();
    countries.set(country, (countries.get(country) ?? 0) + 1);
  }

  const historySeries = historyRows.map((row) => ({
    date: row["date"] ?? null,
    referringDomains: num(row["referring_domains"]),
    backlinks: num(row["backlinks"]),
    newBacklinks: num(row["new_backlinks"]),
    lostBacklinks: num(row["lost_backlinks"]),
    newReferringDomains: num(row["new_referring_domains"]),
    lostReferringDomains: num(row["lost_referring_domains"]),
  }));

  const referringDomainCount = num(summaryRow["referring_domains"]) ?? domainRows.length;

  const normalized = {
    strategySource: STRATEGY_SOURCE,
    profile: {
      rank: num(summaryRow["rank"]),
      backlinks: num(summaryRow["backlinks"]),
      referringDomains: referringDomainCount,
      referringMainDomains: num(summaryRow["referring_main_domains"]),
      referringIps: num(summaryRow["referring_ips"]),
      brokenBacklinks: num(summaryRow["broken_backlinks"]),
      spamScore: num(summaryRow["backlinks_spam_score"]),
      internalLinksCount: num(summaryRow["internal_links_count"]),
    },
    anchors: {
      rowsObserved: anchorRows.length,
      backlinksCovered: anchorBacklinks,
      distribution: anchorDistribution,
      bands: ANCHOR_DEFAULTS,
    },
    referringDomainQuality: {
      observed: domainRows.length,
      medianRank: ranks.length > 0 ? ranks.sort((a, b) => a - b)[Math.floor(ranks.length / 2)] : null,
      maxSpamScore: spamScores.length > 0 ? Math.max(...spamScores) : null,
      flaggedForReview: flagged.map((row) => ({
        domain: row["domain"] ?? null,
        spamScore: num(row["backlinks_spam_score"]) ?? num(row["spam_score"]),
        backlinks: num(row["backlinks"]),
        rank: num(row["rank"]),
      })),
    },
    followSplit: followCounts,
    topLinkedPages: pageRows.slice(0, 20).map((row) => ({
      url: row["url"] ?? row["page_address"] ?? null,
      backlinks: num(row["backlinks"]),
      referringDomains: num(row["referring_domains"]),
      rank: num(row["rank"]),
    })),
    geography: Object.fromEntries(countries),
    history: { months: historySeries.length, series: historySeries },
    snapshots: {
      summary: summary.snapshotId,
      referringDomains: domains.snapshotId,
      backlinks: links.snapshotId,
      anchors: anchors.snapshotId,
      pages: pages.snapshotId,
      history: history.snapshotId,
    },
  };

  // Factor availability. A factor is scored only when real evidence exists;
  // absence is reported, never imputed.
  const factors: HealthFactorScore[] = HEALTH_FACTORS.map(({ key }) => {
    const provenance = {
      source: "dataforseo" as const,
      confidence: 0.9,
      label: "DataForSEO Backlinks API, live evidence",
    };
    switch (key) {
      case "referring_domain_count":
        return { key, score: null, provenance: summaryRow["referring_domains"] === undefined ? null : provenance };
      case "anchor_naturalness":
        return { key, score: null, provenance: anchorRows.length > 0 ? provenance : null };
      case "toxic_link_ratio":
        return { key, score: null, provenance: domainRows.length > 0 ? provenance : null };
      case "link_velocity":
        return { key, score: null, provenance: historySeries.length > 0 ? provenance : null };
      case "follow_ratio":
        return { key, score: null, provenance: linkRows.length > 0 ? provenance : null };
      case "geographic_relevance":
        return { key, score: null, provenance: countries.size > 0 ? provenance : null };
      default:
        return { key, score: null, provenance: domainRows.length > 0 ? provenance : null };
    }
  });

  const missingFactors = factors.filter((factor) => factor.provenance === null).map((factor) => factor.key);
  const health = scoreBacklinkHealth(factors);

  const collectedAt = new Date().toISOString();
  const reportingDate = collectedAt.slice(0, 10);
  const requestFingerprint = fingerprint("internal:/backlinks/evidence", { target }, reportingDate);

  await persistSnapshot(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: "backlinks",
    endpoint: "internal:/backlinks/evidence",
    kind: "backlinks_evidence",
    target,
    mode: "derived",
    requestFingerprint,
    requestParams: { target, derivedFrom: normalized.snapshots },
    reportingDate,
    task: null,
    rows: [normalized],
    totals: { missingFactors, sufficient: health.sufficient },
    costUsd: 0,
  });

  return { target, collectedAt, costUsd, factors, missingFactors, health, normalized };
}
