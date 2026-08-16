export type TitleH1Finding = {
  id: string;
  rule: string;
  targetKind: string;
  targetUrl: string;
  thresholdSatisfied: boolean;
  observedAt: string;
  sourceChecksum: string;
};

export type LivePageEvidence = {
  requestedUrl: string;
  finalUrl: string;
  allowlisted: boolean;
  title: string | null;
  h1s: string[];
  mainText: string;
  observedAt: string;
  contentChecksum: string;
};

export type GscQueryEvidence = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageEvidence = {
  pageUrl: string;
  currentPeriod: { start: string; end: string };
  comparisonPeriod: { start: string; end: string } | null;
  rows: GscQueryEvidence[];
  observedAt: string;
  sourceChecksum: string;
};

export type CompetitorTitleH1Evidence = {
  query: string;
  domain: string;
  title: string | null;
  h1: string | null;
  observedAt: string;
  sourceChecksum: string;
  provider: "dataforseo";
};

export type PreviousTitleH1Change = {
  changeRequestId: string;
  canonicalUrl: string;
  approvedTitle: string;
  approvedH1: string;
  publishedAt: string | null;
  state: string;
};

export type TitleH1EvidenceBundle = {
  finding: TitleH1Finding;
  live: LivePageEvidence;
  gsc: GscPageEvidence;
  competitors: CompetitorTitleH1Evidence[];
  ga4: Record<string, unknown> | null;
  previousChanges: PreviousTitleH1Change[];
};

export type InvestigationCode =
  | "ineligible_finding"
  | "invalid_live_page"
  | "missing_live_title"
  | "missing_live_h1"
  | "ambiguous_live_h1"
  | "missing_live_main_text"
  | "missing_gsc_evidence"
  | "finding_threshold_not_satisfied"
  | "missing_competitor_evidence"
  | "missing_source_provenance"
  | "validation_failed";

export type InvestigationReason = { code: InvestigationCode; message: string };

export type TitleH1Draft = {
  proposedTitle: string;
  proposedH1: string;
  rationale: string;
  expectedMetric: "clicks" | "impressions" | "ctr" | "position";
  confidenceRationale: string;
  verification: string;
  reversal: string;
  claims: string[];
};
