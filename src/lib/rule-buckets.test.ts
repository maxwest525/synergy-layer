import { describe, expect, it } from "vitest";

import { RULE_ASSIGNMENTS, unmetPrerequisites, type RuleBucket } from "./rule-buckets";
import { SEARCH_CONSOLE_THRESHOLDS, SEO_RULES } from "./rule-thresholds";
import { ALL_SEARCH_RULES } from "./finding-copy";
import type { Ga4CheckRule } from "./ga4-rule-checks";
import type { OnPageCheckRule } from "./onpage-rule-checks";
import type { PageSpeedCheckRule } from "./pagespeed-rule-checks";
import type { DiscoveryCheckRule } from "./dataforseo/discovery-rule-checks";
import type { UmamiCheckRule } from "./umami-rule-checks";
import type { BacklinkCheckRule } from "./backlink-rule-checks";

/**
 * Rules deliberately excluded from RULE_ASSIGNMENTS: they carry their own
 * SERP-derived confidence (a heuristic classifier's own score, not a Search
 * Console count) and were never part of the handoff's volume table.
 */
const EXCLUDED_FROM_BUCKETING = new Set<string>([
  "competitor_outranks_owned",
  "owned_absent_from_approved_serps",
]);

/**
 * Compile-time exhaustiveness for the GA4 family: ga4-rule-checks.ts has no
 * runtime array of its rule ids (only the `Ga4CheckRule` type), so a new rule
 * id added there without a matching key here fails the build, not just this
 * test at runtime.
 */
const GA4_RULES_COVERED: Record<Ga4CheckRule, true> = {
  page_traffic_loss: true,
  page_traffic_gain: true,
  event_disappeared: true,
  zero_engagement_page: true,
};

/**
 * Same compile-time exhaustiveness for the PageSpeed family: the module
 * exposes only the `PageSpeedCheckRule` type, so a new rule id added there
 * without a key here fails the build rather than this test at runtime.
 */
const PAGESPEED_RULES_COVERED: Record<PageSpeedCheckRule, true> = {
  page_lcp_poor: true,
  page_cls_poor: true,
};

/**
 * Same compile-time exhaustiveness for the discovery family
 * (dataforseo/discovery-rule-checks.ts): the module exposes only the
 * `DiscoveryCheckRule` type, so a new rule id added there without a key here
 * fails the build rather than this test at runtime. Covers all four rules,
 * including the two that file an operator DECISION (a domain_ownership_candidates
 * row) rather than a recommendation -- they still need a bucket assignment so
 * an empty screen can name what they are waiting on.
 */
const DISCOVERY_RULES_COVERED: Record<DiscoveryCheckRule, true> = {
  overlap_list_reached_the_row_limit: true,
  same_registration_details_across_two_known_domains: true,
  identical_technology_stack_across_two_known_domains: true,
  rival_page_mentions_your_brand: true,
};

/**
 * Same compile-time exhaustiveness for the Umami family: the module exposes
 * only the `UmamiCheckRule` type, so a new rule id added there without a key
 * here fails the build rather than this test at runtime.
 */
const UMAMI_RULES_COVERED: Record<UmamiCheckRule, true> = {
  umami_zero_recorded: true,
  umami_site_traffic_shift: true,
  umami_referrer_source_stopped: true,
};

/**
 * Same compile-time exhaustiveness for the OnPage site-audit family: the
 * module exposes only the `OnPageCheckRule` type (no runtime array), so a new
 * rule id added there without a key here fails the build rather than this
 * test at runtime. Ships five of the eight rules named in
 * docs/handoffs/2026-08-28-parallel-rule-sessions.md; the three crawl-meta
 * rules are a follow-up.
 */
const ONPAGE_RULES_COVERED: Record<OnPageCheckRule, true> = {
  non_indexable_pages_found: true,
  crawl_pages_error_status: true,
  redirect_chain_present: true,
  duplicate_titles_across_pages: true,
  duplicate_descriptions_across_pages: true,
};

/**
 * Same compile-time exhaustiveness for the Backlinks family: the module
 * exposes only the `BacklinkCheckRule` type, so a new rule id added there
 * without a key here fails the build rather than this test at runtime.
 */
const BACKLINK_RULES_COVERED: Record<BacklinkCheckRule, true> = {
  inbound_link_to_error_page: true,
  linked_page_never_audited: true,
  link_profile_coverage_partial: true,
};

/**
 * The rule ids RULE_ASSIGNMENTS must cover, read from the actual runtime
 * unions rather than a hand-maintained list — SEO_RULES (family A) and
 * ALL_SEARCH_RULES (families B and C, via finding-copy.ts) plus the
 * compile-time-checked GA4, PageSpeed, discovery, Umami, OnPage and
 * Backlinks ids above, minus the explicit exclusion set. This is what
 * catches drift like a new pooled rule shipping without a bucket assignment.
 */
const EXPECTED_RULE_IDS = [
  ...new Set<string>([
    ...SEO_RULES,
    ...ALL_SEARCH_RULES,
    ...Object.keys(GA4_RULES_COVERED),
    ...Object.keys(PAGESPEED_RULES_COVERED),
    ...Object.keys(DISCOVERY_RULES_COVERED),
    ...Object.keys(UMAMI_RULES_COVERED),
    ...Object.keys(ONPAGE_RULES_COVERED),
    ...Object.keys(BACKLINK_RULES_COVERED),
  ]),
].filter((rule) => !EXCLUDED_FROM_BUCKETING.has(rule));

describe("RULE_ASSIGNMENTS", () => {
  it("assigns every rule exactly once", () => {
    for (const rule of EXPECTED_RULE_IDS) {
      const matches = RULE_ASSIGNMENTS.filter((assignment) => assignment.rule === rule);
      expect(matches, `expected exactly one assignment for "${rule}"`).toHaveLength(1);
    }
  });

  it("has no assignments outside the expected set", () => {
    const extra = RULE_ASSIGNMENTS.map((a) => a.rule).filter(
      (rule) => !EXPECTED_RULE_IDS.includes(rule),
    );
    expect(extra).toEqual([]);
  });

  it("gives every assignment a non-empty reasoning string", () => {
    for (const assignment of RULE_ASSIGNMENTS) {
      expect(assignment.why.length).toBeGreaterThan(0);
    }
  });

  it("carries the live threshold as needsPerTarget for beyond_current_volume rules", () => {
    const byRule = new Map(RULE_ASSIGNMENTS.map((a) => [a.rule, a]));
    const strikingDistance = byRule.get("striking_distance_query");
    expect(strikingDistance?.bucket).toBe("beyond_current_volume" satisfies RuleBucket);
    expect(strikingDistance?.needsPerTarget).toBe(
      SEARCH_CONSOLE_THRESHOLDS.strikingDistance.minImpressions,
    );
  });

  it("needs no threshold for fact rules", () => {
    const byRule = new Map(RULE_ASSIGNMENTS.map((a) => [a.rule, a]));
    expect(byRule.get("zero_impression_page")?.needsPerTarget).toBeNull();
    expect(byRule.get("index_coverage_drift")?.needsPerTarget).toBeNull();
    expect(byRule.get("event_disappeared")?.needsPerTarget).toBeNull();
  });

  it("buckets the two pooled site-level rules", () => {
    const byRule = new Map(RULE_ASSIGNMENTS.map((a) => [a.rule, a]));
    expect(byRule.get("site_visibility_shift")?.bucket).toBe("pooled" satisfies RuleBucket);
    expect(byRule.get("site_clicks_shift")?.bucket).toBe("pooled" satisfies RuleBucket);
  });
});

describe("non-volume prerequisites", () => {
  it("declares alsoNeeds on every rule, so a new rule cannot ship without an answer", () => {
    for (const assignment of RULE_ASSIGNMENTS) {
      expect(Array.isArray(assignment.alsoNeeds)).toBe(true);
    }
  });

  it("names a second collection for every rule that compares against a prior window", () => {
    const byRule = new Map(RULE_ASSIGNMENTS.map((a) => [a.rule, a]));
    for (const rule of ["declining_clicks", "declining_impressions", "visibility_gain"]) {
      expect(byRule.get(rule)?.alsoNeeds).toContain("second_collection");
    }
  });

  it("says nothing when every prerequisite is met", () => {
    expect(
      unmetPrerequisites({
        secondCollection: true,
        pageAudit: true,
        analytics: true,
        urlInspection: true,
        approvedKeywords: true,
        backlinkCollection: true,
        whoisCollection: true,
        technologyCollection: true,
        brandMentionCollection: true,
        reviewedCompetitorSet: true,
        umamiSecondWindow: true,
        onpageCrawl: true,
      }),
    ).toEqual([]);
  });

  it("names each unmet prerequisite once, in plain words, with no rule ids", () => {
    const notes = unmetPrerequisites({
      secondCollection: false,
      pageAudit: false,
      analytics: true,
      urlInspection: true,
      approvedKeywords: true,
      backlinkCollection: true,
      whoisCollection: true,
      technologyCollection: true,
      brandMentionCollection: true,
      reviewedCompetitorSet: true,
      umamiSecondWindow: true,
      onpageCrawl: true,
    });
    expect(notes).toHaveLength(2);
    expect(notes.join(" ")).toContain("second");
    expect(notes.join(" ")).toContain("page audit");
    for (const assignment of RULE_ASSIGNMENTS) {
      expect(notes.join(" ")).not.toContain(assignment.rule);
    }
  });

  it("counts the rules each unmet prerequisite is holding, from the registry", () => {
    const notes = unmetPrerequisites({
      secondCollection: false,
      pageAudit: true,
      analytics: true,
      urlInspection: true,
      approvedKeywords: true,
      backlinkCollection: true,
      whoisCollection: true,
      technologyCollection: true,
      brandMentionCollection: true,
      reviewedCompetitorSet: true,
      onpageCrawl: true,
    });
    const held = RULE_ASSIGNMENTS.filter((a) => a.alsoNeeds.includes("second_collection")).length;
    expect(notes[0]).toContain(String(held));
  });

  it("names the discovery family's own prerequisites when they are unmet", () => {
    const notes = unmetPrerequisites({
      secondCollection: true,
      pageAudit: true,
      analytics: true,
      urlInspection: true,
      approvedKeywords: true,
      backlinkCollection: true,
      whoisCollection: false,
      technologyCollection: false,
      brandMentionCollection: false,
      reviewedCompetitorSet: false,
    });
    expect(notes).toHaveLength(4);
    expect(notes.join(" ")).toContain("whois");
    expect(notes.join(" ")).toContain("technology stack");
    expect(notes.join(" ")).toContain("brand-mention");
    expect(notes.join(" ")).toContain("reviewed");
  });
});
