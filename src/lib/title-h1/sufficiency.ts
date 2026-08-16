import type { InvestigationReason, TitleH1EvidenceBundle } from "./types";

const ELIGIBLE_RULES = new Set([
  "high_impression_low_ctr",
  "zero_click_page",
  "declining_clicks",
  "declining_impressions",
  "approved_query_coverage_gap",
]);

function normalizedUrl(value: string): string {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function hasTimestamp(value: string): boolean {
  return hasValue(value) && Number.isFinite(Date.parse(value));
}

export function assessTitleH1Evidence(
  bundle: TitleH1EvidenceBundle,
): { eligible: true } | { eligible: false; reasons: InvestigationReason[] } {
  const reasons: InvestigationReason[] = [];

  if (bundle.finding.targetKind !== "page" || !ELIGIBLE_RULES.has(bundle.finding.rule)) {
    reasons.push({
      code: "ineligible_finding",
      message: "This finding is not a page-level title/H1 finding supported by this workflow.",
    });
  }

  if (
    !bundle.live.allowlisted ||
    !hasValue(bundle.live.finalUrl) ||
    normalizedUrl(bundle.live.finalUrl) !== normalizedUrl(bundle.finding.targetUrl)
  ) {
    reasons.push({
      code: "invalid_live_page",
      message: "The rendered page did not resolve to the allowlisted finding URL.",
    });
  }
  if (!hasValue(bundle.live.title)) {
    reasons.push({ code: "missing_live_title", message: "The rendered page has no title." });
  }
  if (bundle.live.h1s.length === 0 || !hasValue(bundle.live.h1s[0])) {
    reasons.push({ code: "missing_live_h1", message: "The rendered page has no primary H1." });
  } else if (bundle.live.h1s.filter(hasValue).length !== 1) {
    reasons.push({
      code: "ambiguous_live_h1",
      message: "The rendered page has multiple primary H1 candidates.",
    });
  }
  if (!hasValue(bundle.live.mainText)) {
    reasons.push({
      code: "missing_live_main_text",
      message: "The rendered page has no readable main text for claim validation.",
    });
  }

  const gscMatchesPage =
    normalizedUrl(bundle.gsc.pageUrl) === normalizedUrl(bundle.finding.targetUrl);
  if (!gscMatchesPage || bundle.gsc.rows.length === 0) {
    reasons.push({
      code: "missing_gsc_evidence",
      message: "No finalized page-level Search Console query evidence supports this finding.",
    });
  }
  if (!bundle.finding.thresholdSatisfied) {
    reasons.push({
      code: "finding_threshold_not_satisfied",
      message: "The stored Search Console evidence no longer satisfies the originating rule.",
    });
  }

  const approvedQueries = new Set(bundle.gsc.rows.map((row) => row.query.trim().toLowerCase()));
  const relevantCompetitors = bundle.competitors.filter((row) =>
    approvedQueries.has(row.query.trim().toLowerCase()),
  );
  if (relevantCompetitors.length === 0) {
    reasons.push({
      code: "missing_competitor_evidence",
      message: "No previously stored DataForSEO competitor evidence matches the page queries.",
    });
  }

  const provenanceComplete =
    hasTimestamp(bundle.finding.observedAt) &&
    hasValue(bundle.finding.sourceChecksum) &&
    hasTimestamp(bundle.live.observedAt) &&
    hasValue(bundle.live.contentChecksum) &&
    hasTimestamp(bundle.gsc.observedAt) &&
    hasValue(bundle.gsc.sourceChecksum) &&
    relevantCompetitors.every(
      (row) =>
        row.provider === "dataforseo" &&
        hasTimestamp(row.observedAt) &&
        hasValue(row.sourceChecksum),
    );
  if (!provenanceComplete) {
    reasons.push({
      code: "missing_source_provenance",
      message: "Every evidence source must include its observation time and checksum.",
    });
  }

  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}
