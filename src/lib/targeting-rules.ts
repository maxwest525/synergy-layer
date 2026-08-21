/**
 * What the targeting evidence already in the database says, as pure functions.
 *
 * Keyword candidates are collected, approved and stored, and until this module
 * existed nothing read them again: `finding-router.ts` had no reference to
 * `keyword_candidates` or `tracked_keywords`, so an approval produced no
 * suggestion anywhere. These detectors are the reading half of that wire; the
 * writing half is `dataforseo/targeting-rules.server.ts`.
 *
 * Every rule here is a yes/no reading of stored rows — a keyword nobody looked
 * up, a phrase no page carries — so none of them invents a threshold to decide
 * whether it fires. Where a count exists to judge (referring-domain movement),
 * the confidence comes from `confidence.ts` rather than from a literal.
 */

export type TargetingRule =
  | "approved_keyword_unobserved"
  | "approved_keyword_no_page"
  | "question_asked_no_page"
  | "referring_domain_movement";

export type TargetingObservation = {
  readonly rule: TargetingRule;
  /** The thing the finding is about: a keyword, a question, or a domain. */
  readonly target: string;
  /** Operator-facing. Never contains a rule id. */
  readonly title: string;
  readonly description: string;
  readonly evidence: Record<string, unknown>;
  /**
   * 1 for a fact read straight off stored rows. Anything derived from counts
   * takes its number from `confidence.ts` instead.
   */
  readonly confidence: number;
};

export type ApprovedKeyword = { readonly keyword: string };
export type ObservedSerp = { readonly keyword: string; readonly reportingDate: string };
export type PageText = {
  readonly url: string;
  readonly title: string | null;
  readonly h1: string | null;
};

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** Approved keywords no stored SERP has ever looked up. */
export function detectUnobservedKeywords(
  approved: readonly ApprovedKeyword[],
  observed: readonly ObservedSerp[],
): TargetingObservation[] {
  const seen = new Set(observed.map((serp) => normalise(serp.keyword)));
  return approved
    .filter((entry) => !seen.has(normalise(entry.keyword)))
    .map((entry) => ({
      rule: "approved_keyword_unobserved" as const,
      target: entry.keyword,
      title: `Nothing has checked where you rank for "${entry.keyword}"`,
      description:
        `You approved "${entry.keyword}", and no stored search result exists for it yet, ` +
        "so there is nothing to say about where the site sits for it.",
      evidence: { keyword: entry.keyword, observedKeywords: seen.size },
      confidence: 1,
    }));
}

/**
 * Approved keywords no read page carries.
 *
 * Coverage means the approved phrase itself appears in a stored title or H1.
 * A looser token overlap would decide the question with a threshold nobody
 * chose, and this lane raises no finding that way.
 */
export function detectKeywordsWithoutPage(
  approved: readonly ApprovedKeyword[],
  pages: readonly PageText[],
): TargetingObservation[] {
  // With nothing read, every keyword would look uncovered. That is a statement
  // about the audit, not about the site.
  if (pages.length === 0) return [];

  const haystack = pages.map(
    (page) => `${normalise(page.title ?? "")} ${normalise(page.h1 ?? "")}`,
  );

  return approved
    .filter((entry) => !haystack.some((text) => text.includes(normalise(entry.keyword))))
    .map((entry) => ({
      rule: "approved_keyword_no_page" as const,
      target: entry.keyword,
      title: `No page here is about "${entry.keyword}"`,
      description:
        `You approved "${entry.keyword}", and none of the ${pages.length} pages read so far ` +
        "use that phrase in their title or main heading. A page that is about it is the thing " +
        "that could rank for it.",
      evidence: { keyword: entry.keyword, pagesRead: pages.length },
      confidence: 1,
    }));
}
