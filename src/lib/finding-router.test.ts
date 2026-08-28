import { describe, expect, it } from "vitest";

import { CATEGORIES } from "./categories";
import {
  categoryForChangeRequest,
  categoryForFinding,
  pageUrlFromSuggestedAction,
  ruleFromMetadata,
} from "./finding-router";

describe("the bug this module exists to fix", () => {
  it("sends a competitor rule to Your competition, not Your pages", () => {
    // Both of these are seo-validation rules. Routing on the module alone filed
    // them under Your pages, where a competitor finding makes no sense.
    expect(categoryForFinding("seo-validation", { rule: "competitor_outranks_owned" })).toBe(
      "competition",
    );
    expect(categoryForFinding("seo-validation", { rule: "owned_absent_from_approved_serps" })).toBe(
      "competition",
    );
  });

  it("keeps the same module's performance rules in Getting found on Google", () => {
    for (const rule of [
      "declining_clicks",
      "declining_impressions",
      "declining_position",
      "high_impression_low_ctr",
      "zero_click_page",
      "significant_period_change",
      "research_page_traction",
    ]) {
      expect(categoryForFinding("seo-validation", { rule })).toBe("search");
    }
  });

  it("can actually return Site health", () => {
    // Nothing in the previous router could ever return this, so Site health was
    // a category no finding could reach.
    expect(categoryForFinding("site-audit", null)).toBe("health");
    expect(CATEGORIES.some((category) => category.id === "health")).toBe(true);
  });
});

describe("routing precedence", () => {
  it("prefers the stored rule over the module", () => {
    expect(categoryForFinding("seo-validation", { rule: "competitor_outranks_owned" })).toBe(
      "competition",
    );
  });

  it("falls back to the module when the rule is unknown", () => {
    // A new rule in a known module must keep working without an entry.
    expect(categoryForFinding("ga4", { rule: "some_rule_added_next_week" })).toBe("visitors");
  });

  it("falls back to the module when no rule is stored", () => {
    expect(categoryForFinding("search-console", null)).toBe("search");
    expect(categoryForFinding("competitor-intelligence", {})).toBe("competition");
  });

  it("lands anything unplaceable in Your pages rather than dropping it", () => {
    expect(categoryForFinding("something-new", null)).toBe("pages");
    expect(categoryForFinding(null, null)).toBe("pages");
  });

  it("only ever returns a category that exists in the nav", () => {
    const ids = new Set(CATEGORIES.map((category) => category.id));
    const samples = [
      categoryForFinding("seo-validation", { rule: "competitor_outranks_owned" }),
      categoryForFinding("site-audit", null),
      categoryForFinding("umami", null),
      categoryForFinding(null, null),
    ];
    for (const id of samples) expect(ids.has(id)).toBe(true);
  });
});

describe("ruleFromMetadata", () => {
  it("reads a stored rule id", () => {
    expect(ruleFromMetadata({ property: "x", rule: "weak_ctr_page" })).toBe("weak_ctr_page");
  });

  it("does not trust the shape of a jsonb column", () => {
    expect(ruleFromMetadata(null)).toBeNull();
    expect(ruleFromMetadata("weak_ctr_page")).toBeNull();
    expect(ruleFromMetadata(["weak_ctr_page"])).toBeNull();
    expect(ruleFromMetadata({ rule: 42 })).toBeNull();
    expect(ruleFromMetadata({ rule: "" })).toBeNull();
  });
});

describe("the page address a rule finding's stored target points at", () => {
  it("reads a page URL out of the stored suggested action", () => {
    expect(
      pageUrlFromSuggestedAction({
        kind: "review",
        rule: "weak_ctr_page",
        target: "https://trumoveinc.com/corporate-relocation",
      }),
    ).toBe("https://trumoveinc.com/corporate-relocation");
  });

  it("keeps only the page half of the coverage-gap page :: query form", () => {
    expect(
      pageUrlFromSuggestedAction({ target: "https://trumoveinc.com/moving :: piano transport" }),
    ).toBe("https://trumoveinc.com/moving");
  });

  it("returns no address when the target is not a page", () => {
    // A query rule targets a search term, a site rule the literal `site`, a
    // competitor rule a bare domain. None of them is a page address.
    expect(pageUrlFromSuggestedAction({ target: "piano transport cost" })).toBeNull();
    expect(pageUrlFromSuggestedAction({ target: "site" })).toBeNull();
    expect(pageUrlFromSuggestedAction({ target: "unitedvanlines.com" })).toBeNull();
  });

  it("does not trust the shape of a jsonb column", () => {
    expect(pageUrlFromSuggestedAction(null)).toBeNull();
    expect(pageUrlFromSuggestedAction("https://trumoveinc.com")).toBeNull();
    expect(pageUrlFromSuggestedAction(["https://trumoveinc.com"])).toBeNull();
    expect(pageUrlFromSuggestedAction({ target: 42 })).toBeNull();
    expect(pageUrlFromSuggestedAction({})).toBeNull();
  });
});

describe("change requests inherit their finding's category", () => {
  it("keeps a title fix raised by a search rule in Getting found on Google", () => {
    // Drafting a fix should not move the work to a different part of the app.
    expect(categoryForChangeRequest("page_wording", "search")).toBe("search");
  });

  it("uses the proposal type when nothing raised it", () => {
    expect(categoryForChangeRequest("page_wording", null)).toBe("pages");
    expect(categoryForChangeRequest("page_metadata", null)).toBe("pages");
    expect(categoryForChangeRequest("site.crawl_directives", null)).toBe("health");
  });
});
