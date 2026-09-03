/**
 * A rule may not claim authority it cannot produce (CODE-98).
 *
 * Every rule in this repository carries a `why` written in prose, and until now
 * nothing checked any of it. The prose was typed by whoever added the rule, and
 * a sentence attributed to Google or to the ingested playbook was true only in
 * the sense that somebody believed it when they wrote it. Meanwhile 236KB of
 * chunked, embedded authority sat in the knowledge base with two readers, both
 * of them wording drafters.
 *
 * A citation here is not a link and not a footnote. It is a claim that an exact
 * run of words exists in a named source, and it is checkable: `verifyCitation`
 * resolves the quote against the stored chunk text and fails when it does not
 * appear. A rule whose citation stops resolving is a rule whose justification
 * has been edited out from under it, and that is a test failure rather than a
 * silent drift.
 *
 * Determinism is the point. The same rows and the same authority produce the
 * same findings with the same justification, every run, with no model deciding
 * anything at the moment a finding is filed.
 */

/** Which ingested source a quote is claimed to come from. */
export type AuthorityKey = string;

/**
 * One checkable claim: this exact wording appears in this source.
 *
 * `quote` is matched verbatim after whitespace is collapsed, because chunking
 * reflows line breaks and a citation should not fail over a wrapped line. It is
 * not lowercased and not stripped of punctuation: a quote that only matches
 * once its capitals are removed is a paraphrase, and a paraphrase is what this
 * exists to stop.
 */
export type Citation = {
  source: AuthorityKey;
  quote: string;
  /** What the rule takes from the quote, in the rule author's own words. */
  because: string;
};

export type CitationVerdict =
  | { ok: true; source: AuthorityKey; matchedIn: number }
  | { ok: false; source: AuthorityKey; reason: string };

/** Collapse runs of whitespace so a reflowed chunk still matches its quote. */
export function normalizeForQuoteMatch(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Whether the quote appears in any of the source's chunks.
 *
 * Pure, so the same chunk text always gives the same verdict and the check can
 * run without a database in a unit test. `matchedIn` is the ordinal of the
 * chunk that carried it, which is what makes a passing citation reproducible
 * rather than merely true.
 */
export function verifyCitation(
  citation: Citation,
  chunks: readonly { ordinal: number; body: string }[],
): CitationVerdict {
  if (chunks.length === 0) {
    return {
      ok: false,
      source: citation.source,
      reason: `No ingested chunks for "${citation.source}", so nothing can carry this quote.`,
    };
  }
  const needle = normalizeForQuoteMatch(citation.quote);
  if (needle.length === 0) {
    return { ok: false, source: citation.source, reason: "The citation quotes nothing." };
  }
  const hit = [...chunks]
    .sort((a, b) => a.ordinal - b.ordinal)
    .find((chunk) => normalizeForQuoteMatch(chunk.body).includes(needle));
  if (!hit) {
    return {
      ok: false,
      source: citation.source,
      reason: `"${citation.source}" carries no such wording. The quote was not found in any of its ${chunks.length} chunks, so this rule is citing something the source does not say.`,
    };
  }
  return { ok: true, source: citation.source, matchedIn: hit.ordinal };
}

export type RuleCitationReport = {
  rule: string;
  verdicts: CitationVerdict[];
  ok: boolean;
};

export function verifyRuleCitations(
  rule: string,
  citations: readonly Citation[],
  chunksBySource: ReadonlyMap<AuthorityKey, readonly { ordinal: number; body: string }[]>,
): RuleCitationReport {
  const verdicts = citations.map((citation) =>
    verifyCitation(citation, chunksBySource.get(citation.source) ?? []),
  );
  return { rule, verdicts, ok: verdicts.every((verdict) => verdict.ok) };
}
