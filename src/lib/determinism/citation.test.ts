import { describe, expect, it } from "vitest";

import { normalizeForQuoteMatch, verifyCitation, verifyRuleCitations } from "./citation";
import { RULE_CITATIONS, citedSources, uncitedRules } from "./rule-citations";

/**
 * Chunk 0 of "SEO & AEO Laws, Algorithms and Decision Models" as stored in this
 * tenant's knowledge base, reflowed exactly as chunking reflows it. Both quotes
 * were confirmed present against the live rows on 2026-09-02: Law 3 in chunk 0,
 * the diagnostic law in chunk 1.
 */
const LAW_CHUNK = {
  ordinal: 0,
  body: `The 20 Governing Laws
Business outcomes outrank vanity metrics.
Eligibility precedes relevance.
One intent gets one primary URL. Synonyms and close
variants belong together when Google returns
substantially the same results.`,
};

const DIAGNOSTIC_CHUNK = {
  ordinal: 1,
  body: `Diagnostic law: never prescribe a later-stage fix for an earlier-stage failure.
Rewriting an H1 cannot fix an accidental noindex.`,
};

describe("a quote either is in the source or is not", () => {
  it("matches across a line break, because chunking reflows text", () => {
    const verdict = verifyCitation(
      {
        source: "playbook.seo-aeo-laws",
        quote:
          "One intent gets one primary URL. Synonyms and close variants belong together when Google returns substantially the same results.",
        because: "test",
      },
      [LAW_CHUNK],
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.matchedIn).toBe(0);
  });

  it("refuses a paraphrase, which is the whole point", () => {
    const verdict = verifyCitation(
      {
        source: "playbook.seo-aeo-laws",
        quote: "One intent should generally get one URL",
        because: "test",
      },
      [LAW_CHUNK],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("carries no such wording");
  });

  it("refuses a quote whose capitals had to be removed to match", () => {
    const verdict = verifyCitation(
      { source: "playbook.seo-aeo-laws", quote: "one intent gets one primary url", because: "t" },
      [LAW_CHUNK],
    );
    expect(verdict.ok).toBe(false);
  });

  it("fails when the source has no ingested chunks at all", () => {
    const verdict = verifyCitation(
      { source: "playbook.never-ingested", quote: "anything", because: "t" },
      [],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("No ingested chunks");
  });

  it("names which chunk carried it, so a pass is reproducible", () => {
    const verdict = verifyCitation(
      {
        source: "playbook.seo-aeo-laws",
        quote: "never prescribe a later-stage fix for an earlier-stage failure",
        because: "test",
      },
      [LAW_CHUNK, DIAGNOSTIC_CHUNK],
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.matchedIn).toBe(1);
  });

  it("collapses whitespace without touching anything else", () => {
    expect(normalizeForQuoteMatch("  a\n  b \t c ")).toBe("a b c");
  });
});

describe("the registry as it stands", () => {
  const chunks = new Map([["playbook.seo-aeo-laws", [LAW_CHUNK, DIAGNOSTIC_CHUNK]]]);

  it("every declared citation resolves against the stored wording", () => {
    for (const [rule, citations] of Object.entries(RULE_CITATIONS)) {
      const report = verifyRuleCitations(rule, citations, chunks);
      const failed = report.verdicts.filter((v) => !v.ok);
      expect(failed, `${rule}: ${failed.map((f) => (f.ok ? "" : f.reason)).join(" ")}`).toEqual([]);
    }
  });

  it("names the sources a verifier has to load", () => {
    expect(citedSources()).toEqual(["playbook.seo-aeo-laws"]);
  });

  it("reports the rules resting on nobody's authority but the author's", () => {
    const uncited = uncitedRules(["serp_rotation", "weak_ctr_page", "zero_impression_page"]);
    expect(uncited).toEqual(["weak_ctr_page", "zero_impression_page"]);
    // Stated rather than asserted away: most rules in this repository are in
    // this list, and shrinking it is the work.
    expect(uncited.length).toBeGreaterThan(0);
  });
});
