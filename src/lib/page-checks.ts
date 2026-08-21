/**
 * Pure on page analysis. Everything here reads the rendered HTML of a page and
 * reports what is actually there. Nothing fetches, nothing estimates, nothing
 * scores. A check either found a real defect on a real page or it did not.
 */

export type PageFacts = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  hasViewport: boolean;
  h1s: string[];
  h2Count: number;
  headingSkips: boolean;
  imageCount: number;
  imagesMissingAlt: number;
  jsonLdTypes: string[];
  jsonLdInvalid: boolean;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  ogTitle: string | null;
  ogImage: string | null;
  hasFavicon: boolean;
};

export type CheckId =
  | "title_missing"
  | "title_too_long"
  | "title_too_short"
  | "title_duplicate"
  | "description_missing"
  | "description_too_long"
  | "description_too_short"
  | "description_duplicate"
  | "h1_missing"
  | "h1_multiple"
  | "h1_duplicate"
  | "canonical_missing"
  | "noindex"
  | "nofollow"
  | "viewport_missing"
  | "lang_missing"
  | "structured_data_missing"
  | "structured_data_invalid"
  | "image_alt_missing"
  | "thin_content"
  | "no_internal_links"
  | "og_missing"
  | "url_underscores"
  | "url_query_string";

export type Severity = "critical" | "warning" | "advice";

export type PageIssue = {
  check: CheckId;
  url: string;
  severity: Severity;
  detail: string;
};

export type CheckDefinition = {
  check: CheckId;
  label: string;
  severity: Severity;
  /** Imperative instruction shown when this check has at least one affected page. */
  instruction: (pageCount: number) => string;
  /** True when the existing title and H1 proposal loop can fix it in one click. */
  fixableByWordingProposal: boolean;
};

export const CHECKS: Record<CheckId, CheckDefinition> = {
  // Title-link doc: no character limit on <title>, but "the title link is
  // truncated in Google Search results as needed, typically to fit the
  // device width" — a missing title has nothing to truncate or rewrite.
  // https://developers.google.com/search/docs/appearance/title-link
  title_missing: {
    check: "title_missing",
    label: "Missing tab title",
    severity: "critical",
    instruction: (n) => `Write a tab title for ${n} pages that have none.`,
    fixableByWordingProposal: true,
  },
  // https://developers.google.com/search/docs/appearance/title-link —
  // "the title link is truncated in Google Search results as needed,
  // typically to fit the device width." TITLE_MAX is a proxy for that fit,
  // not a documented character limit.
  title_too_long: {
    check: "title_too_long",
    label: "Tab title cut off in results",
    severity: "warning",
    instruction: (n) => `Shorten the tab title on ${n} pages so Google stops truncating it.`,
    fixableByWordingProposal: true,
  },
  // Stated assumption: a short title reads as thin to a person scanning
  // results; Google's own doc sets no minimum length for <title>.
  title_too_short: {
    check: "title_too_short",
    label: "Tab title too thin",
    severity: "advice",
    instruction: (n) => `Expand the tab title on ${n} pages to describe the page and the service.`,
    fixableByWordingProposal: true,
  },
  // Stated assumption: no Google doc says duplicate titles are penalized;
  // the reason given is for the reader comparing results, not for ranking.
  title_duplicate: {
    check: "title_duplicate",
    label: "Same tab title on several pages",
    severity: "critical",
    instruction: (n) => `Give each of these ${n} pages its own tab title.`,
    fixableByWordingProposal: true,
  },
  // Snippet doc: "Google sometimes uses the meta description HTML element
  // if it might give users a more accurate description of the page than
  // content taken directly from the page" — a missing tag just means
  // Google always falls back to page content instead.
  // https://developers.google.com/search/docs/appearance/snippet
  description_missing: {
    check: "description_missing",
    label: "Missing search description",
    severity: "critical",
    instruction: (n) => `Write a search description for ${n} pages so Google stops inventing one.`,
    fixableByWordingProposal: false,
  },
  // Snippet doc covers appearance and click-through, not ranking; it does
  // not state a description ranking effect at all.
  // https://developers.google.com/search/docs/appearance/snippet
  description_too_long: {
    check: "description_too_long",
    label: "Search description cut off",
    severity: "advice",
    instruction: (n) =>
      `Trim the search description on ${n} pages to under 160 characters so the snippet under your link reads well in results.`,
    fixableByWordingProposal: false,
  },
  // Snippet doc covers appearance and click-through, not ranking; it does
  // not state a description ranking effect at all.
  // https://developers.google.com/search/docs/appearance/snippet
  description_too_short: {
    check: "description_too_short",
    label: "Search description too thin",
    severity: "advice",
    instruction: (n) =>
      `Expand the search description on ${n} pages to at least 70 characters so the snippet under your link reads well in results.`,
    fixableByWordingProposal: false,
  },
  // Stated assumption: no Google doc says duplicate descriptions are
  // penalized; the reason given is for the reader comparing results.
  description_duplicate: {
    check: "description_duplicate",
    label: "Same search description on several pages",
    severity: "warning",
    instruction: (n) => `Give each of these ${n} pages its own search description.`,
    fixableByWordingProposal: false,
  },
  // Title-link doc: "If Google Search detects that there are multiple
  // large, prominent headings, it may use the first heading as the text
  // for the title link" — a missing headline leaves nothing for that to
  // draw on either.
  // https://developers.google.com/search/docs/appearance/title-link
  h1_missing: {
    check: "h1_missing",
    label: "Missing headline",
    severity: "critical",
    instruction: (n) => `Add a main headline to ${n} pages that have none.`,
    fixableByWordingProposal: true,
  },
  // Title-link doc: "If Google Search detects that there are multiple
  // large, prominent headings, it may use the first heading as the text
  // for the title link" — competing headlines invite Google to rewrite the
  // title link rather than use the <title> tag.
  // https://developers.google.com/search/docs/appearance/title-link
  h1_multiple: {
    check: "h1_multiple",
    label: "More than one main headline",
    severity: "warning",
    instruction: (n) => `Leave one main headline on ${n} pages and demote the rest.`,
    fixableByWordingProposal: true,
  },
  // Stated assumption: no Google doc says a duplicate headline is
  // penalized; the reason given is for the reader, not for ranking.
  h1_duplicate: {
    check: "h1_duplicate",
    label: "Same headline on several pages",
    severity: "critical",
    instruction: (n) => `Give each of these ${n} pages its own headline.`,
    fixableByWordingProposal: true,
  },
  // Canonicalization doc: "A canonical URL is the URL of a page that
  // Google chose as the most representative from a set of duplicate
  // pages"; declaring one is a hint that helps Google "show only one
  // version of the otherwise duplicate content in its search results."
  // https://developers.google.com/search/docs/crawling-indexing/canonicalization
  canonical_missing: {
    check: "canonical_missing",
    label: "No canonical address",
    severity: "warning",
    instruction: (n) => `Declare the canonical address on ${n} pages so duplicates cannot split.`,
    fixableByWordingProposal: false,
  },
  // Robots meta tag doc: noindex means "Do not show this page, media, or
  // resource in search results."
  // https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  noindex: {
    check: "noindex",
    label: "Page blocked from Google",
    severity: "critical",
    instruction: (n) => `Remove the noindex tag from ${n} pages that should be findable.`,
    fixableByWordingProposal: false,
  },
  // Robots meta tag doc: nofollow means "Do not follow the links on this
  // page."
  // https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  nofollow: {
    check: "nofollow",
    label: "Links on the page not followed",
    severity: "warning",
    instruction: (n) => `Remove the nofollow robots tag from ${n} pages.`,
    fixableByWordingProposal: false,
  },
  // Stated assumption: no viewport-specific Google doc quote was found
  // this pass (the mobile-friendly doc URLs tried returned 404); kept as
  // a standard mobile-rendering practice, not cited to Google's wording.
  viewport_missing: {
    check: "viewport_missing",
    label: "Not set up for phones",
    severity: "critical",
    instruction: (n) => `Add the mobile viewport tag to ${n} pages.`,
    fixableByWordingProposal: false,
  },
  // Stated assumption: no Google doc quote on the html lang attribute was
  // found this pass; kept as a general accessibility/clarity practice.
  lang_missing: {
    check: "lang_missing",
    label: "Language not declared",
    severity: "advice",
    instruction: (n) => `Declare the page language on ${n} pages.`,
    fixableByWordingProposal: false,
  },
  // Structured data policy doc: "Using structured data enables a feature
  // to be present, it does not guarantee that it will be present" — richer
  // results, not ranking.
  // https://developers.google.com/search/docs/appearance/structured-data/sd-policies
  structured_data_missing: {
    check: "structured_data_missing",
    label: "No structured data",
    severity: "warning",
    instruction: (n) =>
      `Add structured data to ${n} pages so Google can show richer results for them.`,
    fixableByWordingProposal: false,
  },
  // Structured data policy doc: "If your page contains a structured data
  // issue, it can result in a manual action" against the rich-result
  // eligibility; standard web ranking is unaffected.
  // https://developers.google.com/search/docs/appearance/structured-data/sd-policies
  structured_data_invalid: {
    check: "structured_data_invalid",
    label: "Broken structured data",
    severity: "critical",
    instruction: (n) => `Fix unreadable structured data on ${n} pages. Google is ignoring it now.`,
    fixableByWordingProposal: false,
  },
  // Google Images doc: "Google uses alt text along with computer vision
  // algorithms and the contents of the page to understand the subject
  // matter of the image," and alt text "also improves accessibility for
  // people who can't see images."
  // https://developers.google.com/search/docs/appearance/google-images
  image_alt_missing: {
    check: "image_alt_missing",
    label: "Images with no description",
    severity: "warning",
    instruction: (n) => `Describe the images on ${n} pages so they are readable and searchable.`,
    fixableByWordingProposal: false,
  },
  // SEO starter guide: "The length of the content alone doesn't matter for
  // ranking purposes (there's no magical word count target)." The only
  // defensible reason to flag a near-empty page is that it gives Google
  // nothing to understand, not that it hurts ranking.
  // https://developers.google.com/search/docs/fundamentals/seo-starter-guide
  // Stated assumption: 250 words is a proxy for "nearly empty"; nothing
  // derives it — what would settle it is Google publishing any floor,
  // which it says it will not.
  thin_content: {
    check: "thin_content",
    label: "Almost nothing on the page",
    severity: "advice",
    instruction: (n) =>
      `Give ${n} nearly empty pages something to say — a page with almost no text gives Google nothing to understand.`,
    fixableByWordingProposal: false,
  },
  // SEO starter guide: "Links are a great way to connect your users and
  // search engines to other parts of your site," and "the vast majority
  // of the new pages Google finds every day are through links."
  // https://developers.google.com/search/docs/fundamentals/seo-starter-guide
  no_internal_links: {
    check: "no_internal_links",
    label: "Orphaned from the rest of the site",
    severity: "warning",
    instruction: (n) => `Link ${n} isolated pages to the rest of the site.`,
    fixableByWordingProposal: false,
  },
  // Stated assumption: Open Graph tags are a Facebook/social-platform
  // convention, not a Google-documented signal; kept for how shared links
  // look on other platforms, not for Search.
  og_missing: {
    check: "og_missing",
    label: "No share preview",
    severity: "advice",
    instruction: (n) => `Add a share title and image to ${n} pages so shared links look right.`,
    fixableByWordingProposal: false,
  },
  // URL structure doc: "We recommend separating words in your URLs, when
  // possible. Specifically, we recommend using hyphens (-) instead of
  // underscores (_) to separate words in your URLs, as it helps users and
  // search engines better identify concepts in the URL." (the doc says
  // "search engines", not "Google" — kept as written)
  // https://developers.google.com/search/docs/crawling-indexing/url-structure
  url_underscores: {
    check: "url_underscores",
    label: "Underscores in the address",
    severity: "advice",
    instruction: (n) =>
      `Separate the words in ${n} page addresses with hyphens instead of underscores.`,
    fixableByWordingProposal: false,
  },
  // URL structure doc, "Use as few parameters as you can": "Whenever
  // possible, shorten URLs by trimming unnecessary parameters (meaning,
  // parameters that don't change the content)."
  // https://developers.google.com/search/docs/crawling-indexing/url-structure
  // Stated assumption: a parameter on a page the site itself declares indexable
  // is worth naming; nothing here judges parameters on pages nobody declared.
  url_query_string: {
    check: "url_query_string",
    label: "Address carries parameters",
    severity: "advice",
    instruction: (n) =>
      `Give ${n} pages a plain address without parameters, so one page has one address.`,
    fixableByWordingProposal: false,
  },
};

// Stated assumption: display truncation is by pixels and unpublished; these
// character counts are folklore medians, kept only as a proxy.
export const TITLE_MAX = 60;
export const TITLE_MIN = 25;
// Stated assumption: display truncation is by pixels and unpublished; these
// character counts are folklore medians, kept only as a proxy.
export const DESCRIPTION_MAX = 160;
export const DESCRIPTION_MIN = 70;
// Stated assumption: 250 words is a proxy for "nearly empty"; nothing
// derives it — what would settle it is Google publishing any floor, which
// it says it will not.
export const THIN_CONTENT_WORDS = 250;

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  const value = match?.[2] ?? match?.[3] ?? null;
  return value === null ? null : decodeEntities(value.trim());
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function text(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function metaTags(html: string): string[] {
  return html.match(/<meta\b[^>]*>/gi) ?? [];
}

function metaContent(html: string, kind: "name" | "property", key: string): string | null {
  for (const tag of metaTags(html)) {
    const found = attr(tag, kind);
    if (found && found.toLowerCase() === key) {
      const content = attr(tag, "content");
      return content && content.length > 0 ? content : null;
    }
  }
  return null;
}

function sameHost(href: string, pageUrl: string): boolean | null {
  try {
    const base = new URL(pageUrl);
    const target = new URL(href, base);
    if (!target.protocol.startsWith("http")) return null;
    return target.host === base.host;
  } catch {
    return null;
  }
}

/**
 * What the address itself says. Parsed rather than pattern-matched so an
 * underscore in the host, which is not a word in a path, is not reported.
 * An address that will not parse yields nothing: guessing at a malformed URL
 * would report a defect on a path we invented.
 * Note: percent-encoded underscores (%5F) are not detected — URL.pathname
 * does not decode them, and parsed-not-guessed is the point.
 */
export function urlDefects(pageUrl: string): { underscores: boolean; queryString: boolean } {
  try {
    const parsed = new URL(pageUrl);
    return {
      underscores: parsed.pathname.includes("_"),
      queryString: parsed.search.length > 0,
    };
  } catch {
    return { underscores: false, queryString: false };
  }
}

/** Reads the observable facts of one rendered page. Never throws on odd markup. */
export function extractPageFacts(html: string, markdown: string, pageUrl: string): PageFacts {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? text(titleMatch[1] ?? "") || null : null;

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => text(match[1] ?? ""))
    .filter((value) => value.length > 0);
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  let headingSkips = false;
  for (let index = 1; index < headings.length; index += 1) {
    const current = headings[index] ?? 0;
    const previous = headings[index - 1] ?? 0;
    if (current - previous > 1) headingSkips = true;
  }

  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesMissingAlt = images.filter((tag) => {
    const alt = attr(tag, "alt");
    return alt === null || alt.length === 0;
  }).length;

  const jsonLdTypes: string[] = [];
  let jsonLdInvalid = false;
  for (const block of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed: unknown = JSON.parse((block[1] ?? "").trim());
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (node && typeof node === "object") {
          const record = node as Record<string, unknown>;
          const type = record["@type"];
          if (typeof type === "string") jsonLdTypes.push(type);
          if (Array.isArray(type)) {
            type
              .filter((entry): entry is string => typeof entry === "string")
              .forEach((entry) => jsonLdTypes.push(entry));
          }
          if (Array.isArray(record["@graph"])) walk(record["@graph"]);
        }
      };
      walk(parsed);
    } catch {
      jsonLdInvalid = true;
    }
  }

  let internalLinks = 0;
  let externalLinks = 0;
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, "href");
    if (!href || href.startsWith("#")) continue;
    const internal = sameHost(href, pageUrl);
    if (internal === true) internalLinks += 1;
    else if (internal === false) externalLinks += 1;
  }

  let canonical: string | null = null;
  let hasFavicon = false;
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (rel === "canonical" && !canonical) canonical = attr(tag, "href");
    if (rel.includes("icon")) hasFavicon = true;
  }

  const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";

  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>[\]()!|-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);

  return {
    title,
    metaDescription: metaContent(html, "name", "description"),
    canonical,
    robots: metaContent(html, "name", "robots"),
    lang: attr(htmlTag, "lang"),
    hasViewport: metaContent(html, "name", "viewport") !== null,
    h1s,
    h2Count: (html.match(/<h2\b/gi) ?? []).length,
    headingSkips,
    imageCount: images.length,
    imagesMissingAlt,
    jsonLdTypes: [...new Set(jsonLdTypes)],
    jsonLdInvalid,
    internalLinks,
    externalLinks,
    wordCount: words.length,
    ogTitle: metaContent(html, "property", "og:title"),
    ogImage: metaContent(html, "property", "og:image"),
    hasFavicon,
  };
}

/** Case and whitespace insensitive comparison key. Empty wording never collides. */
export function normalizeWording(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim().toLowerCase();
  return collapsed.length > 0 ? collapsed : null;
}

function duplicateKeys(values: (string | null)[]): Set<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = normalizeWording(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export type AnalyzedPage = { url: string; facts: PageFacts };

/** Every real defect found across every analyzed page. */
export function evaluatePages(pages: AnalyzedPage[]): PageIssue[] {
  const duplicateTitles = duplicateKeys(pages.map((page) => page.facts.title));
  const duplicateH1s = duplicateKeys(pages.map((page) => page.facts.h1s[0] ?? null));
  const duplicateDescriptions = duplicateKeys(pages.map((page) => page.facts.metaDescription));

  const issues: PageIssue[] = [];
  const add = (check: CheckId, url: string, detail: string): void => {
    issues.push({ check, url, severity: CHECKS[check].severity, detail });
  };

  for (const { url, facts } of pages) {
    const title = facts.title;
    if (!title) add("title_missing", url, "The page has no tab title at all.");
    else {
      if (title.length > TITLE_MAX)
        add("title_too_long", url, `${title.length} characters: "${title}"`);
      if (title.length < TITLE_MIN)
        add("title_too_short", url, `${title.length} characters: "${title}"`);
      if (duplicateTitles.has(normalizeWording(title) ?? "")) {
        add("title_duplicate", url, `Shared tab title: "${title}"`);
      }
    }

    const description = facts.metaDescription;
    if (!description) add("description_missing", url, "No search description is set.");
    else {
      if (description.length > DESCRIPTION_MAX)
        add("description_too_long", url, `${description.length} characters.`);
      if (description.length < DESCRIPTION_MIN)
        add("description_too_short", url, `${description.length} characters.`);
      if (duplicateDescriptions.has(normalizeWording(description) ?? "")) {
        add("description_duplicate", url, `Shared description: "${description.slice(0, 90)}"`);
      }
    }

    const h1 = facts.h1s[0] ?? null;
    if (facts.h1s.length === 0) add("h1_missing", url, "The page has no main headline.");
    if (facts.h1s.length > 1)
      add("h1_multiple", url, `${facts.h1s.length} main headlines on one page.`);
    if (h1 && duplicateH1s.has(normalizeWording(h1) ?? "")) {
      add("h1_duplicate", url, `Shared headline: "${h1}"`);
    }

    if (!facts.canonical) add("canonical_missing", url, "No canonical address is declared.");

    const robots = facts.robots?.toLowerCase() ?? "";
    if (robots.includes("noindex")) add("noindex", url, `Robots tag says "${facts.robots}".`);
    if (robots.includes("nofollow")) add("nofollow", url, `Robots tag says "${facts.robots}".`);

    if (!facts.hasViewport) add("viewport_missing", url, "No mobile viewport tag.");
    if (!facts.lang) add("lang_missing", url, "The html tag declares no language.");

    if (facts.jsonLdInvalid)
      add("structured_data_invalid", url, "Structured data on the page is not readable JSON.");
    else if (facts.jsonLdTypes.length === 0)
      add("structured_data_missing", url, "No structured data blocks were found.");

    if (facts.imagesMissingAlt > 0) {
      add(
        "image_alt_missing",
        url,
        `${facts.imagesMissingAlt} of ${facts.imageCount} images have no description.`,
      );
    }

    if (facts.wordCount < THIN_CONTENT_WORDS)
      add("thin_content", url, `About ${facts.wordCount} words of text.`);

    if (facts.internalLinks === 0)
      add("no_internal_links", url, "No links from this page to the rest of the site.");

    if (!facts.ogTitle || !facts.ogImage)
      add("og_missing", url, "Share title or share image is missing.");

    const address = urlDefects(url);
    if (address.underscores)
      add("url_underscores", url, `The address separates words with underscores: ${url}`);
    if (address.queryString) add("url_query_string", url, `The address carries parameters: ${url}`);
  }

  return issues;
}

export type CheckFinding = {
  check: CheckId;
  label: string;
  severity: Severity;
  instruction: string;
  fixableByWordingProposal: boolean;
  pages: { url: string; detail: string }[];
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };

/** One finding per check that actually matched, worst first. */
export function groupFindings(issues: PageIssue[]): CheckFinding[] {
  const byCheck = new Map<CheckId, { url: string; detail: string }[]>();
  for (const issue of issues) {
    const list = byCheck.get(issue.check) ?? [];
    list.push({ url: issue.url, detail: issue.detail });
    byCheck.set(issue.check, list);
  }
  return [...byCheck.entries()]
    .map(([check, pages]) => {
      const definition = CHECKS[check];
      return {
        check,
        label: definition.label,
        severity: definition.severity,
        instruction: definition.instruction(pages.length),
        fixableByWordingProposal: definition.fixableByWordingProposal,
        pages: [...pages].sort((a, b) => a.url.localeCompare(b.url)),
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.pages.length - a.pages.length ||
        a.label.localeCompare(b.label),
    );
}

export function buildAuditHeadline(input: {
  observedPages: number;
  findings: CheckFinding[];
}): string {
  if (input.observedPages === 0) {
    return "No pages have been read yet. Run the page audit to check every page Google reported.";
  }
  const worst = input.findings[0];
  if (!worst) return `No defects found across ${input.observedPages} read pages.`;
  const total = input.findings.reduce((sum, finding) => sum + finding.pages.length, 0);
  return `${total} defects across ${input.observedPages} pages. Start here: ${worst.instruction}`;
}
