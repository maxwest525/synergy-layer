import type { Database } from "@/integrations/supabase/types";

/**
 * Pure rule checks over already-stored PageSpeed readings. Kept out of the
 * .server module so they test without mocks, matching ga4-rule-checks.ts and
 * search-console-rule-checks.ts. Nothing here reads a network or a database.
 *
 * Two things about this data decide the whole design, and both are stated on
 * screen rather than buried:
 *
 * 1. THE THRESHOLDS ARE GOOGLE'S, NOT OURS. Google publishes the Core Web
 *    Vitals bands: LCP good at or under 2.5s and poor above 4.0s; CLS good at
 *    or under 0.1 and poor above 0.25. Nothing here invents a number, and
 *    nothing fires in the middle "needs improvement" band, only the band
 *    Google itself calls poor, which keeps this quiet rather than noisy.
 *
 * 2. THIS IS LAB DATA, NOT THE FIELD ASSESSMENT GOOGLE RANKS ON. The stored
 *    values come from `lighthouseResult.audits[].numericValue`
 *    (measurement/pagespeed.ts), which is one simulated load on Google's
 *    infrastructure. Google's page-experience signal and the Search Console
 *    Core Web Vitals report both read FIELD data from real visitors (CrUX).
 *    A poor lab reading is a diagnostic worth acting on; it is NOT proof the
 *    page fails Core Web Vitals for real users, and no copy here says it is.
 *
 * Bucketing: both rules are `fact`. They read a direct measurement of one
 * page rather than inferring from traffic, so they answer at any volume,
 * which makes them among the few rules this property's traffic can support.
 */

export type PageSpeedCheckRule = "page_lcp_poor" | "page_cls_poor";

export type PageSpeedObservationDraft = {
  rule: PageSpeedCheckRule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

/**
 * Google's published Core Web Vitals bands, transcribed not derived.
 * Source: web.dev/articles/lcp and web.dev/articles/cls, the reference
 * Google's own Search documentation points at for these thresholds.
 */
export const PAGESPEED_RULE_THRESHOLDS = {
  lcp: { goodMs: 2500, poorMs: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  maxFindingsPerRun: 10,
} as const;

/** One stored pagespeed_snapshots row, in the shape the checks need. */
export type PageSpeedReading = {
  url: string;
  strategy: string;
  lcpMs: number | null;
  cls: number | null;
  collectedAt: string;
};

/**
 * A direct measurement is either taken or not, so confidence does not vary
 * with volume the way a count-based rule's does. It is held below 1 because
 * a single lab run varies between runs, and because lab is not field.
 *
 * Stated assumption: 0.75 is a chosen figure, not a measured one. What would
 * settle it: the run-to-run spread of the stored Lighthouse scores for one
 * page, once several snapshots of the same page exist to read it from
 * (AGT-15).
 */
const MEASUREMENT_CONFIDENCE = 0.75;

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} seconds`;
}

/** The most recent reading per URL and strategy; older runs are history. */
export function newestReadingPerPage(readings: readonly PageSpeedReading[]): PageSpeedReading[] {
  const newest = new Map<string, PageSpeedReading>();
  for (const reading of readings) {
    const key = `${reading.url} ${reading.strategy}`;
    const held = newest.get(key);
    if (!held || reading.collectedAt > held.collectedAt) newest.set(key, reading);
  }
  return [...newest.values()];
}

export function checkPageSpeedReadings(
  readings: readonly PageSpeedReading[],
): PageSpeedObservationDraft[] {
  const drafts: PageSpeedObservationDraft[] = [];

  for (const reading of newestReadingPerPage(readings)) {
    const measuredOn = reading.collectedAt.slice(0, 10);
    const onWhat = `on ${reading.strategy}`;

    if (reading.lcpMs !== null && reading.lcpMs > PAGESPEED_RULE_THRESHOLDS.lcp.poorMs) {
      drafts.push({
        rule: "page_lcp_poor",
        target: reading.url,
        title: `Main content takes ${seconds(reading.lcpMs)} to appear ${onWhat}`,
        description:
          `The largest thing on this page took ${seconds(reading.lcpMs)} to appear when it was measured on ${measuredOn}. ` +
          `Google calls anything over ${seconds(PAGESPEED_RULE_THRESHOLDS.lcp.poorMs)} poor, and ${seconds(PAGESPEED_RULE_THRESHOLDS.lcp.goodMs)} or under good. ` +
          `This was one test load rather than a reading from real visitors, so it shows the page is slow to build, not that Google has judged it slow for the people visiting it.`,
        evidence: {
          url: reading.url,
          strategy: reading.strategy,
          largestContentfulPaintMs: reading.lcpMs,
          googlePoorAboveMs: PAGESPEED_RULE_THRESHOLDS.lcp.poorMs,
          googleGoodAtOrUnderMs: PAGESPEED_RULE_THRESHOLDS.lcp.goodMs,
          measurementKind: "lab",
          measuredOn,
        },
        businessImpact: "medium",
        confidence: MEASUREMENT_CONFIDENCE,
      });
    }

    if (reading.cls !== null && reading.cls > PAGESPEED_RULE_THRESHOLDS.cls.poor) {
      drafts.push({
        rule: "page_cls_poor",
        target: reading.url,
        title: `This page shifts around as it loads ${onWhat}`,
        description:
          `Content on this page moved while it was still loading, scoring ${reading.cls.toFixed(2)} when measured on ${measuredOn}. ` +
          `Google calls anything over ${PAGESPEED_RULE_THRESHOLDS.cls.poor} poor, and ${PAGESPEED_RULE_THRESHOLDS.cls.good} or under good. ` +
          `Movement while loading is what makes someone tap the wrong thing. This was one test load rather than a reading from real visitors.`,
        evidence: {
          url: reading.url,
          strategy: reading.strategy,
          cumulativeLayoutShift: reading.cls,
          googlePoorAbove: PAGESPEED_RULE_THRESHOLDS.cls.poor,
          googleGoodAtOrUnder: PAGESPEED_RULE_THRESHOLDS.cls.good,
          measurementKind: "lab",
          measuredOn,
        },
        businessImpact: "medium",
        confidence: MEASUREMENT_CONFIDENCE,
      });
    }
  }

  drafts.sort((a, b) => a.target.localeCompare(b.target) || a.rule.localeCompare(b.rule));
  return drafts.slice(0, PAGESPEED_RULE_THRESHOLDS.maxFindingsPerRun);
}
