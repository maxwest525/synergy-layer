/**
 * What a rendered page says about the broker's federal registration, read
 * from its visible text (CODE-86, IDEA-12).
 *
 * The rule this serves is 49 CFR § 371.107, "What information must I display
 * in my advertisements and Internet Web homepage?", which binds household
 * goods brokers (COMPETITOR_RESEARCH_LOG.md records the operator as one):
 *
 *   (b) "You must prominently display your U.S. DOT registration number(s)
 *       and MC license number issued by the FMCSA in your advertisements and
 *       Internet Web homepage(s)."
 *   (c) "You must prominently display in your advertisements and Internet
 *       website(s) your status as a household goods broker and the statement
 *       that you will not transport an individual shipper's household goods,
 *       but that you will arrange for the transportation of the household
 *       goods by an FMCSA-authorized household goods motor carrier, whose
 *       charges will be determined by its published tariff."
 *
 * https://www.law.cornell.edu/cfr/text/49/371.107, read 2026-09-02.
 *
 * Paragraph (a), the street address, is not read: nothing here can tell a
 * postal address from any other run of words without guessing, and a guess
 * is not a fact. Every field below is what the text literally holds. The
 * numbers are read after tags are stripped because the live homepage renders
 * the label and the number in separate elements ("<span>USDOT</span> 4507647").
 */

export type LicenceFacts = {
  /** Distinct numbers written next to a "USDOT", "US DOT" or "DOT" label. */
  usdotNumbers: string[];
  /** Distinct numbers written next to an "MC" label. */
  mcNumbers: string[];
  /** The words "household goods broker" appear in the text. */
  brokerStatusShown: boolean;
  /** Which parts of the paragraph (c) statement the text carries. */
  statement: {
    /** "not transport", as in "will not transport" or "do not transport". */
    notTransport: boolean;
    /** "arrange", "arranges" or "arranging". */
    arrange: boolean;
    /** "tariff". */
    tariff: boolean;
  };
};

/** The homepage's facts beside a count of how many read pages show both numbers. */
export type SiteLicenceFacts = {
  /** The homepage address the audit rendered, or null when it read no homepage. */
  homepageUrl: string | null;
  homepage: LicenceFacts | null;
  pagesRead: number;
  pagesShowingBothNumbers: number;
};

export type ReadPage = {
  url: string;
  finalUrl: string | null;
  licence: LicenceFacts;
};

/** The text a reader sees: scripts, styles and tags removed, entities decoded. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// A label, then any of the separators sites put between a label and its
// number ("#", "No.", "Number", ":", "-"), then the digits. USDOT numbers are
// up to eight digits and MC numbers up to seven; the ranges below admit any
// registration written as four to eight digits so a short historic number is
// not missed.
const USDOT_PATTERN = /\b(?:U\.?S\.?\s?)?DOT\b\s*(?:#|no\.?|number|:|-)?\s*#?\s*(\d{4,8})\b/gi;
const MC_PATTERN = /\bMC\b\s*(?:#|no\.?|number|:|-)?\s*#?\s*(\d{4,8})\b/gi;

function numbersAfter(text: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(pattern)) found.add(match[1]!);
  return [...found];
}

/** Read the registration facts out of one rendered page. */
export function licenceFactsIn(html: string): LicenceFacts {
  const text = visibleText(html);
  return {
    usdotNumbers: numbersAfter(text, USDOT_PATTERN),
    mcNumbers: numbersAfter(text, MC_PATTERN),
    brokerStatusShown: /\bhousehold[\s-]goods broker\b/i.test(text),
    statement: {
      notTransport: /\bnot\s+transport\b/i.test(text),
      arrange: /\barrang(?:e|es|ing)\b/i.test(text),
      tariff: /\btariff\b/i.test(text),
    },
  };
}

function isHomepage(url: string, origin: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin.toLowerCase() === origin.toLowerCase() &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      parsed.search === ""
    );
  } catch {
    return false;
  }
}

/**
 * The homepage's facts, found by the address the audit asked for or the one
 * it landed on, beside the count of read pages that show both numbers.
 */
export function siteLicenceFacts(origin: string, pages: readonly ReadPage[]): SiteLicenceFacts {
  const home =
    pages.find((page) => isHomepage(page.url, origin)) ??
    pages.find((page) => page.finalUrl !== null && isHomepage(page.finalUrl, origin));
  return {
    homepageUrl: home?.url ?? null,
    homepage: home?.licence ?? null,
    pagesRead: pages.length,
    pagesShowingBothNumbers: pages.filter(
      (page) => page.licence.usdotNumbers.length > 0 && page.licence.mcNumbers.length > 0,
    ).length,
  };
}
