/**
 * One target, however many ways it is spelled (CODE-93).
 *
 * `detectKeywordsWithoutPage` asked whether a page title or H1 contained the
 * approved phrase as a literal substring. The logic was sound and the input was
 * not: 40 of the 50 approved keywords are DataForSEO variants of one query --
 * "best long distance movers", "best long-distance movers", "best moving
 * company for long distance", "top rated long distance movers", "movers long
 * distance" and twenty more. A page titled "Long Distance Movers" matches
 * exactly one of them, so the rule filed 40-odd findings for what is one gap,
 * and each one said the site needed a page. Nobody wants forty pages named
 * after forty spellings of the same search.
 *
 * Two things fix it, and neither invents a score:
 *
 *   1. Word-set matching instead of substring. A page covers a phrase when the
 *      page's own words include every content word of that phrase. Order stops
 *      mattering, so "movers long distance" and "long distance movers" ask the
 *      same question of the same page, which is what they are.
 *
 *   2. Grouping by that same word set, so the variants collapse into one target
 *      and the rule reports the target rather than the spelling.
 *
 * The one judgement here is which words qualify a search without changing which
 * page would answer it. It is a written list rather than a similarity
 * threshold, so it can be read and argued with.
 */

/**
 * Stated assumption: these words rank or qualify a result without changing
 * which page is the right answer. Somebody searching "best long distance
 * movers" and somebody searching "long distance movers" want the same page of
 * yours; the difference is what they hope to read on it, not which page it is.
 *
 * Deliberately NOT here: "cheap", "free" and "commercial", which describe a
 * different offer rather than the same offer more warmly, and every place name,
 * which is the whole target in a route query (`isRouteQuery`).
 */
const QUALIFIERS = new Set([
  "best",
  "top",
  "good",
  "great",
  "highest",
  "rated",
  "recommended",
  "reputable",
  "reliable",
  "trusted",
  "professional",
]);

/**
 * Words carrying no target of their own. Kept short: every word dropped here is
 * a word two different searches could have differed by.
 */
const STOP_WORDS = new Set(["a", "an", "the", "for", "of", "and", "my", "your", "with"]);

/** Lowercase, split on anything that is not a letter or digit. Hyphens included, so "long-distance" is two words exactly as "long distance" is. */
export function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

/**
 * Singular form, for the one difference that is never a different target:
 * "mover" and "movers", "company" and "companies".
 */
function singularExported(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 2 && word.endsWith("es") && /(ch|sh|s|x|z)es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The content words of a phrase: qualifiers and stop words removed, singularised. */
export function contentWords(phrase: string): string[] {
  return words(phrase)
    .filter((word) => !STOP_WORDS.has(word) && !QUALIFIERS.has(word))
    .map(singularExported);
}

/**
 * The identity of a target: its content words, deduplicated and sorted.
 *
 * Sorted because word order is a spelling difference here, not a different
 * search: "movers long distance" and "long distance movers" are one target
 * asked twice.
 */
export function phraseKey(phrase: string): string {
  return [...new Set(contentWords(phrase))].sort().join(" ");
}

/**
 * Whether a page's text answers a phrase: every content word of the phrase
 * appears among the page's own words.
 *
 * Containment rather than equality, so a page titled "Long Distance Movers and
 * Interstate Moving" still covers "long distance movers". A page whose words
 * are a strict subset does not cover the phrase, which is the case the old
 * substring test got right and this one keeps.
 */
export function pageCoversPhrase(pageText: string, phrase: string): boolean {
  const needed = contentWords(phrase);
  if (needed.length === 0) return false;
  const have = new Set(words(pageText).map(singularExported));
  return needed.every((word) => have.has(word));
}

export type PhraseGroup<T> = {
  /** The shared identity of every member. */
  key: string;
  /** The shortest spelling, which is the one to show an operator. */
  canonical: string;
  /** Every approved spelling that resolves to this target, shortest first. */
  variants: string[];
  /** The rows that produced them, in the order they were given. */
  members: T[];
};

/**
 * Collapse many spellings into the targets behind them.
 *
 * The canonical spelling is the shortest, and ties break alphabetically: it is
 * a display choice with no bearing on matching, and picking the shortest keeps
 * the operator reading "long distance movers" rather than "best rated long
 * distance moving company" as the name of their own target.
 */
export function groupByPhrase<T>(
  rows: readonly T[],
  phraseOf: (row: T) => string,
): PhraseGroup<T>[] {
  const groups = new Map<string, { members: T[]; spellings: Set<string> }>();
  for (const row of rows) {
    const phrase = phraseOf(row);
    const key = phraseKey(phrase);
    if (key === "") continue;
    const group = groups.get(key) ?? { members: [], spellings: new Set<string>() };
    group.members.push(row);
    group.spellings.add(phrase);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const variants = [...group.spellings].sort((a, b) => a.length - b.length || a.localeCompare(b));
    return { key, canonical: variants[0] as string, variants, members: group.members };
  });
}

export type ClosestPage = {
  url: string;
  /** Content words of the target this page already carries. */
  shared: string[];
  /** Content words of the target this page does not carry. */
  missing: string[];
};

/**
 * The page nearest to answering a target, and exactly what it is short of.
 *
 * This exists because "it needs a page" was a hardcoded sentence, not a
 * conclusion. Nothing looked at the site before saying it. A target that no
 * page covers is usually not a missing page at all: it is a page that already
 * says most of it, one or two words short of saying all of it.
 *
 * Nearest means the most shared content words. That is a count, not a
 * threshold, and the answer is nothing at all rather than a weak guess when
 * no page shares a single word. Whether the nearest page should be reworded
 * or a new one written is the operator's decision, taken with the overlap in
 * front of them rather than in place of it.
 */
export function closestPageFor(
  phrase: string,
  pages: readonly { url: string; text: string }[],
): ClosestPage | null {
  const needed = contentWords(phrase);
  if (needed.length === 0) return null;

  let best: ClosestPage | null = null;
  for (const page of pages) {
    const have = new Set(words(page.text).map(singularExported));
    const shared = needed.filter((word) => have.has(word));
    if (shared.length === 0) continue;
    if (best === null || shared.length > best.shared.length) {
      best = {
        url: page.url,
        shared,
        missing: needed.filter((word) => !have.has(word)),
      };
    }
  }
  return best;
}
