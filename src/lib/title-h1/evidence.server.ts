import { createHash } from "node:crypto";

import type {
  CompetitorTitleH1Evidence,
  GscPageEvidence,
  LivePageEvidence,
  PreviousTitleH1Change,
  TitleH1EvidenceBundle,
  TitleH1Finding,
} from "./types";

type RenderedPageRead = Omit<LivePageEvidence, "requestedUrl" | "contentChecksum">;
type GscRead = Omit<GscPageEvidence, "sourceChecksum">;

export type TitleH1EvidenceSources = {
  renderPage(url: string): Promise<RenderedPageRead>;
  readGsc(finding: TitleH1Finding): Promise<GscRead>;
  readStoredCompetitors(input: {
    pageUrl: string;
    queries: string[];
  }): Promise<CompetitorTitleH1Evidence[]>;
  readPreviousChanges(pageUrl: string): Promise<PreviousTitleH1Change[]>;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNullable(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeText(value);
  return normalized || null;
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function titleH1ContentChecksum(input: {
  finalUrl: string;
  title: string | null;
  h1s: string[];
  mainText: string;
}): string {
  return checksum({
    finalUrl: input.finalUrl,
    title: normalizeNullable(input.title),
    h1s: input.h1s.map(normalizeText).filter(Boolean),
    mainText: normalizeText(input.mainText),
  });
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function collectTitleH1Evidence(
  finding: TitleH1Finding,
  sources: TitleH1EvidenceSources,
): Promise<TitleH1EvidenceBundle> {
  const [liveResult, gscResult, previousResult] = await Promise.allSettled([
    sources.renderPage(finding.targetUrl),
    sources.readGsc(finding),
    sources.readPreviousChanges(finding.targetUrl),
  ]);

  if (liveResult.status === "rejected") {
    throw new Error(`Live webpage evidence failed: ${message(liveResult.reason)}`);
  }
  if (gscResult.status === "rejected") {
    throw new Error(`Search Console evidence failed: ${message(gscResult.reason)}`);
  }
  if (previousResult.status === "rejected") {
    throw new Error(`Previous-change evidence failed: ${message(previousResult.reason)}`);
  }

  const liveWithoutChecksum = {
    requestedUrl: finding.targetUrl,
    finalUrl: liveResult.value.finalUrl,
    allowlisted: liveResult.value.allowlisted,
    title: normalizeNullable(liveResult.value.title),
    h1s: liveResult.value.h1s.map(normalizeText).filter(Boolean),
    mainText: normalizeText(liveResult.value.mainText),
    observedAt: liveResult.value.observedAt,
  };
  const live: LivePageEvidence = {
    ...liveWithoutChecksum,
    contentChecksum: titleH1ContentChecksum(liveWithoutChecksum),
  };

  const gscWithoutChecksum = {
    ...gscResult.value,
    rows: gscResult.value.rows.map((row) => ({
      ...row,
      query: normalizeText(row.query).toLowerCase(),
    })),
  };
  const gsc: GscPageEvidence = {
    ...gscWithoutChecksum,
    sourceChecksum: checksum(gscWithoutChecksum),
  };

  let storedCompetitors: CompetitorTitleH1Evidence[];
  try {
    storedCompetitors = await sources.readStoredCompetitors({
      pageUrl: finding.targetUrl,
      queries: [...new Set(gsc.rows.map((row) => row.query))],
    });
  } catch (error) {
    throw new Error(`Stored DataForSEO evidence failed: ${message(error)}`);
  }

  const competitors = storedCompetitors.map((row) => ({
    ...row,
    query: normalizeText(row.query).toLowerCase(),
    domain: normalizeText(row.domain).toLowerCase(),
    title: normalizeNullable(row.title),
    h1: normalizeNullable(row.h1),
  }));

  return {
    finding,
    live,
    gsc,
    competitors,
    ga4: null,
    previousChanges: previousResult.value,
  };
}
