import { describe, expect, it } from "vitest";

import { classifyDomain } from "./competitors.server";

describe("classifyDomain", () => {
  it("keeps general web platforms and public bodies out of the competitor set", () => {
    expect(classifyDomain("facebook.com")).toBe("surface");
    expect(classifyDomain("yelp.com")).toBe("surface");
    expect(classifyDomain("wikipedia.org")).toBe("surface");
    expect(classifyDomain("fmcsa.dot.gov")).toBe("surface");
  });

  it("lets a moving-niche publisher that ranks alongside you count as ranking alongside you", () => {
    // What the business is (a publisher or directory) is the operator's
    // declaration in company_classification, never derived here (COMP-2).
    for (const domain of [
      "movebuddha.com",
      "moving.com",
      "movers.com",
      "move.org",
      "mymovingreviews.com",
      "unpakt.com",
      "hireahelper.com",
      "updater.com",
      "uhaul.com",
    ]) {
      expect(classifyDomain(domain)).toBe("competitor");
    }
  });
});
