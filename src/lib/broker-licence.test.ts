import { describe, expect, it } from "vitest";

import { licenceFactsIn, siteLicenceFacts, visibleText, type LicenceFacts } from "./broker-licence";

const LIVE_SHAPE = `
<html><head><title>TruMove</title><script>const mc = "MC 9999999";</script></head>
<body>
  <p>TruMove is a licensed Household Goods Broker. We do not transport your goods
  ourselves; we arrange the move with an FMCSA-authorized carrier.</p>
  <p><span><span class="text-foreground/60">USDOT</span> 4507647</span>
     <span><span class="text-foreground/60">MC</span> 1784124</span></p>
  <p>Every carrier passes our DOT, insurance, and reputation checks.</p>
</body></html>`;

describe("visibleText", () => {
  it("drops scripts, styles and tags and decodes the common entities", () => {
    expect(visibleText(`<script>x = "USDOT 1"</script><p>A&amp;B&nbsp;<b>C</b></p>`)).toBe("A&B C");
  });
});

describe("licenceFactsIn", () => {
  it("reads the numbers even when the label and the number sit in separate elements", () => {
    const facts = licenceFactsIn(LIVE_SHAPE);
    expect(facts.usdotNumbers).toEqual(["4507647"]);
    expect(facts.mcNumbers).toEqual(["1784124"]);
  });

  it("ignores a number inside a script and a DOT without a number", () => {
    // "MC 9999999" is inside <script>; "our DOT, insurance" carries no number.
    const facts = licenceFactsIn(LIVE_SHAPE);
    expect(facts.mcNumbers).not.toContain("9999999");
    expect(facts.usdotNumbers).toHaveLength(1);
  });

  it("reads the same number written with the usual separators once", () => {
    const facts = licenceFactsIn(
      "<p>MC Number: MC-1784124</p><p>MC# 1784124</p><p>US DOT No. 4507647</p><p>USDOT: 4507647</p>",
    );
    expect(facts.mcNumbers).toEqual(["1784124"]);
    expect(facts.usdotNumbers).toEqual(["4507647"]);
  });

  it("keeps two different numbers under one label apart", () => {
    const facts = licenceFactsIn("<p>USDOT 4507647</p><p>USDOT 2841907 queried 4s ago</p>");
    expect(facts.usdotNumbers).toEqual(["4507647", "2841907"]);
  });

  it("reads the broker status and each part of the statement separately", () => {
    const facts = licenceFactsIn(LIVE_SHAPE);
    expect(facts.brokerStatusShown).toBe(true);
    expect(facts.statement).toEqual({ notTransport: true, arrange: true, tariff: false });
  });

  it("finds nothing on a page that says nothing", () => {
    expect(licenceFactsIn("<p>Moving quotes in minutes.</p>")).toEqual({
      usdotNumbers: [],
      mcNumbers: [],
      brokerStatusShown: false,
      statement: { notTransport: false, arrange: false, tariff: false },
    });
  });
});

describe("siteLicenceFacts", () => {
  const both: LicenceFacts = licenceFactsIn("<p>USDOT 4507647 MC 1784124</p>");
  const none: LicenceFacts = licenceFactsIn("<p>nothing</p>");

  it("takes the homepage by the address asked for, and counts pages showing both numbers", () => {
    const facts = siteLicenceFacts("https://example.com", [
      { url: "https://example.com/services", finalUrl: null, licence: both },
      { url: "https://example.com/", finalUrl: "https://example.com/", licence: none },
      { url: "https://example.com/blog", finalUrl: null, licence: none },
    ]);
    expect(facts.homepageUrl).toBe("https://example.com/");
    expect(facts.homepage).toBe(none);
    expect(facts).toMatchObject({ pagesRead: 3, pagesShowingBothNumbers: 1 });
  });

  it("falls back to the address the homepage landed on", () => {
    const facts = siteLicenceFacts("https://example.com", [
      { url: "https://example.com/home", finalUrl: "https://example.com/", licence: both },
    ]);
    expect(facts.homepageUrl).toBe("https://example.com/home");
    expect(facts.homepage).toBe(both);
  });

  it("records no homepage when none of the read pages is one", () => {
    const facts = siteLicenceFacts("https://example.com", [
      { url: "https://example.com/services", finalUrl: null, licence: both },
    ]);
    expect(facts.homepageUrl).toBeNull();
    expect(facts.homepage).toBeNull();
  });
});
