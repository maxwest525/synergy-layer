import { describe, expect, it } from "vitest";

import type { RenderedPage } from "./source-change";
import { extractSubheadings, verifyRenderedPage } from "./source-change";

/**
 * The wording lane was a title-and-H1 editor because four separate layers said
 * so, and this file was one of them: `verifyRenderedPage` refused any change
 * that did not carry both an SEO title and a page heading. A change that cannot
 * be proven live cannot be approved, so only those two fields were ever
 * offered. These pin the generalisation.
 */
describe("verifyRenderedPage proves whatever fields the change carries", () => {
  const page = {
    finalUrl: "https://trumoveinc.com/services/long-distance-moves",
    title: "Long distance moving",
    heading: "Move across the country",
    metaDescription: "We move you.",
    subheadings: ["What it costs", "How long it takes"],
    visibleText: "",
    renderedBy: "Crawl4AI",
  };

  it("proves a subheading on its own, with no title or H1 in the change", () => {
    const proof = verifyRenderedPage(page, [
      { field: "subheading", label: "Subheading", before: "Pricing", after: "What it costs" },
    ]);
    expect(proof.ok).toBe(true);
    expect(proof.reason).toContain("subheading");
  });

  it("proves a title, an H1 and a subheading together", () => {
    const proof = verifyRenderedPage(page, [
      { field: "seo_title", label: "SEO title", before: "old", after: "Long distance moving" },
      {
        field: "page_heading",
        label: "Page heading",
        before: "old",
        after: "Move across the country",
      },
      { field: "subheading", label: "Subheading", before: "old", after: "How long it takes" },
    ]);
    expect(proof.ok).toBe(true);
  });

  it("refuses when the approved subheading is not among the rendered ones", () => {
    const proof = verifyRenderedPage(page, [
      { field: "subheading", label: "Subheading", before: "old", after: "Not on the page" },
    ]);
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("does not yet serve");
  });

  it("still proves a title and H1 pair exactly as before", () => {
    const proof = verifyRenderedPage(page, [
      { field: "seo_title", label: "SEO title", before: "old", after: "Long distance moving" },
      {
        field: "page_heading",
        label: "Page heading",
        before: "old",
        after: "Move across the country",
      },
    ]);
    expect(proof.ok).toBe(true);
  });

  it("calls an unrendered shell a shell rather than a mismatch", () => {
    const proof = verifyRenderedPage({ ...page, subheadings: [] }, [
      { field: "subheading", label: "Subheading", before: "old", after: "What it costs" },
    ]);
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("unrendered application shell");
  });

  it("refuses a change carrying no provable field, rather than passing it", () => {
    const proof = verifyRenderedPage(page, [
      { field: "robots_txt", label: "robots.txt", before: "a", after: "b" },
    ]);
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("no field a rendered page can be asked about");
  });
});

describe("extractSubheadings", () => {
  it("returns every H2 in document order", () => {
    expect(extractSubheadings("<h2>First</h2><p>x</p><h2 class='a'>Second</h2>")).toEqual([
      "First",
      "Second",
    ]);
  });

  it("returns an empty list when a page has none, never a placeholder", () => {
    expect(extractSubheadings("<h1>Only a heading</h1>")).toEqual([]);
  });
});

describe("proving a broker statement live", () => {
  const STATEMENT =
    "TruMove Inc. arranges transportation through independently authorized FMCSA motor carriers and does not transport household goods. Charges for transportation are determined by the carrier's published tariff.";

  function footerPage(visible: string): RenderedPage {
    return {
      finalUrl: "https://trumoveinc.com/",
      title: "TruMove",
      heading: "TruMove",
      metaDescription: null,
      subheadings: [],
      visibleText: visible,
      renderedBy: "test",
    };
  }

  const change = {
    field: "broker_statement",
    label: "Broker statement",
    before: "old",
    after: STATEMENT,
  };

  it("proves the sentence when the rendered page carries it among other text", () => {
    const proof = verifyRenderedPage(footerPage(`Some hero copy. ${STATEMENT} Copyright 2026.`), [
      change,
    ]);
    expect(proof.ok).toBe(true);
  });

  it("refuses when the page carries the old statement instead", () => {
    const proof = verifyRenderedPage(
      footerPage(
        "TruMove Inc. arranges transportation through independently authorized FMCSA motor carriers and does not transport household goods.",
      ),
      [change],
    );
    expect(proof.ok).toBe(false);
  });

  it("treats an unrendered shell as no proof either way, not as a match", () => {
    const proof = verifyRenderedPage(footerPage(""), [change]);
    expect(proof.ok).toBe(false);
    if (proof.ok) return;
    expect(proof.reason).toContain("unrendered application shell");
  });
});
