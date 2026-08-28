/**
 * Pure rules for turning an approved change request into one exact source edit.
 *
 * Nothing here talks to GitHub, the database, or the browser. The guards live
 * in one place so an execution can only ever write the two approved
 * replacements, and only when the file still looks exactly as it did when the
 * change was proposed.
 */

export type FieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type ExecutionRefusal = { ok: false; reason: string };
export type ExecutionSuccess<T> = { ok: true; value: T };
export type ExecutionResult<T> = ExecutionSuccess<T> | ExecutionRefusal;

export function isFieldChange(value: unknown): value is FieldChange {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["field"] === "string" &&
    typeof row["before"] === "string" &&
    typeof row["after"] === "string" &&
    row["before"] !== row["after"]
  );
}

export function parseFieldChanges(value: unknown): FieldChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFieldChange).map((row) => ({
    field: row.field,
    label: typeof row.label === "string" ? row.label : row.field,
    before: row.before,
    after: row.after,
  }));
}

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Exact literal occurrence count, shared by execution and the read-only preflight. */
export const countOccurrences = occurrences;

/**
 * Apply every approved replacement, or refuse and write nothing. A value that
 * appears zero times or more than once is drift: the file no longer matches
 * what the operator approved, so guessing which occurrence to edit would be a
 * silent unrelated change.
 */
export function applyExactReplacements(
  content: string,
  changes: FieldChange[],
): ExecutionResult<{ content: string; replaced: number; alreadyApplied: boolean }> {
  if (changes.length === 0) {
    return {
      ok: false,
      reason: "This change request stores no exact before/after values to apply.",
    };
  }

  const alreadyApplied = changes.every(
    (change) =>
      occurrences(content, change.before) === 0 && occurrences(content, change.after) === 1,
  );
  if (alreadyApplied) {
    return { ok: true, value: { content, replaced: 0, alreadyApplied: true } };
  }

  let next = content;
  for (const change of changes) {
    const found = occurrences(next, change.before);
    if (found !== 1) {
      return {
        ok: false,
        reason: `Refused without writing: the approved before value for ${change.label} occurs ${found} time(s) in the file, not exactly once. The source has drifted from the approved proposal.`,
      };
    }
    if (occurrences(next, change.after) !== 0) {
      return {
        ok: false,
        reason: `Refused without writing: the proposed new value for ${change.label} already appears in the file, so applying it would be ambiguous.`,
      };
    }
    next = next.replace(change.before, change.after);
  }

  return { ok: true, value: { content: next, replaced: changes.length, alreadyApplied: false } };
}

/** Marker that makes a replayed execution recognisable in git history. */
export function commitMarker(changeRequestId: string): string {
  return `AOOS-change-request: ${changeRequestId}`;
}

export function buildCommitMessage(changeRequestId: string, title: string): string {
  return `${title}\n\n${commitMarker(changeRequestId)}`;
}

/**
 * A revert carries its own marker. Sharing the forward marker would make a
 * revert commit answer the reconciliation search for the commit it undid.
 */
export function revertCommitMarker(changeRequestId: string): string {
  return `AOOS-revert-of-change-request: ${changeRequestId}`;
}

export function buildRevertCommitMessage(changeRequestId: string, title: string): string {
  return `Revert: ${title}\n\n${revertCommitMarker(changeRequestId)}`;
}

export type PublishedProof = {
  ok: boolean;
  expectedTitle: string | null;
  expectedHeading: string | null;
  expectedDescription: string | null;
  foundTitle: string | null;
  foundHeading: string | null;
  foundDescription: string | null;
  renderedBy: string;
  finalUrl: string;
  reason: string;
  /**
   * Robots lane only. The deployed file and the committed file are compared
   * whole, so the proof does not depend on the shape of any one directive
   * edit; these carry the comparison for the database routine to re-check.
   */
  deployedSha256?: string | null;
  committedSha256?: string | null;
  matchedCommitSha?: string | null;
};

/**
 * One rendered page, after JavaScript has run. The target site ships a single
 * page application shell, so raw HTML from the origin cannot carry the page's
 * real title or H1 and can never be proof.
 */
export type RenderedPage = {
  finalUrl: string;
  title: string | null;
  heading: string | null;
  metaDescription: string | null;
  renderedBy: string;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalize(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDocumentTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const text = match?.[1] ? normalize(match[1]) : null;
  return text ? text : null;
}

export function extractFirstHeading(html: string): string | null {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const text = match?.[1] ? normalize(match[1]) : null;
  return text ? text : null;
}

/** The description meta tag's content, whichever order its attributes appear in. */
export function extractMetaDescription(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\bname\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if ((name?.[2] ?? name?.[3])?.trim().toLowerCase() !== "description") continue;
    const content = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const text = content ? normalize(content[2] ?? content[3] ?? "") : null;
    return text ? text : null;
  }
  return null;
}

/** First markdown H1 (`# text`), used when a renderer returns markdown only. */
export function extractMarkdownHeading(markdown: string): string | null {
  const match = /^[ \t]*#[ \t]+(.+)$/m.exec(markdown);
  const text = match?.[1] ? normalize(match[1]) : null;
  return text ? text : null;
}

/** CRLF and trailing-whitespace differences are transport artifacts, not content. */
export function normalizeTextFile(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\s+$/, "");
}

/**
 * Proof for the crawl-directives lane. robots.txt is a static file, so no
 * renderer is involved: the deployed file either equals the committed file at
 * the recorded commit or it does not. Comparing whole files rather than
 * re-finding each edited literal keeps the proof correct for every directive
 * shape — a bare `Disallow:` left by the site-wide unblock fix is a substring
 * of half the lines in a robots file, so literal containment cannot prove it.
 */
export function verifyPublishedRobots(input: {
  deployedContent: string;
  committedContent: string;
  finalUrl: string;
  fetchedBy: string;
  commitSha: string;
}): PublishedProof {
  const base = {
    expectedTitle: null,
    expectedHeading: null,
    expectedDescription: null,
    foundTitle: null,
    foundHeading: null,
    foundDescription: null,
    renderedBy: input.fetchedBy,
    finalUrl: input.finalUrl,
    matchedCommitSha: input.commitSha,
  };
  const deployed = normalizeTextFile(input.deployedContent);
  const committed = normalizeTextFile(input.committedContent);
  if (committed === "") {
    return {
      ...base,
      ok: false,
      reason:
        "The committed robots.txt could not be read from the recorded commit, so nothing can be proven.",
    };
  }
  if (deployed === committed) {
    return {
      ...base,
      ok: true,
      reason: `The deployed robots.txt at ${input.finalUrl} matches the committed file at ${input.commitSha.slice(0, 10)} exactly.`,
    };
  }
  return {
    ...base,
    ok: false,
    reason:
      "The deployed robots.txt does not yet match the committed file. The commit may exist while the site publish or sync is still pending.",
  };
}

/**
 * A commit is not a live page, and a rendered page is the only thing that can
 * show what a visitor actually receives. Only an exact match of every approved
 * value counts as proof: both wording values for the title/H1 lane, the meta
 * description for the page metadata lane.
 */
export function verifyRenderedPage(page: RenderedPage, changes: FieldChange[]): PublishedProof {
  const expectedTitle = changes.find((c) => c.field === "seo_title")?.after ?? null;
  const expectedHeading = changes.find((c) => c.field === "page_heading")?.after ?? null;
  const expectedDescription = changes.find((c) => c.field === "meta_description")?.after ?? null;
  const base = {
    expectedTitle,
    expectedHeading,
    expectedDescription,
    foundTitle: page.title,
    foundHeading: page.heading,
    foundDescription: page.metaDescription,
    renderedBy: page.renderedBy,
    finalUrl: page.finalUrl,
  };

  if (expectedDescription) {
    if (!page.metaDescription) {
      return {
        ...base,
        ok: false,
        reason:
          "The rendered page returned no meta description. That is an unrendered application shell, not proof either way.",
      };
    }
    if (page.metaDescription === normalize(expectedDescription)) {
      return {
        ...base,
        ok: true,
        reason: `The rendered page at ${page.finalUrl} serves the exact approved meta description, as rendered by ${page.renderedBy}.`,
      };
    }
    return {
      ...base,
      ok: false,
      reason:
        "The rendered page does not yet serve the approved meta description. The commit may exist while the site publish or sync is still pending.",
    };
  }

  if (!expectedTitle || !expectedHeading) {
    return {
      ...base,
      ok: false,
      reason: "This change request does not store both an SEO title and a page heading to prove.",
    };
  }

  if (!page.title || !page.heading) {
    const missing = [!page.title ? "document title" : null, !page.heading ? "H1" : null]
      .filter(Boolean)
      .join(" and ");
    return {
      ...base,
      ok: false,
      reason: `The rendered page returned no ${missing}. That is an unrendered application shell, not proof either way.`,
    };
  }

  const titleOk = page.title === normalize(expectedTitle);
  const headingOk = page.heading === normalize(expectedHeading);
  if (titleOk && headingOk) {
    return {
      ...base,
      ok: true,
      reason: `The rendered page at ${page.finalUrl} serves the exact approved title and heading, as rendered by ${page.renderedBy}.`,
    };
  }

  const missing = [!titleOk ? "document title" : null, !headingOk ? "H1" : null]
    .filter(Boolean)
    .join(" and ");
  return {
    ...base,
    ok: false,
    reason: `The rendered page does not yet serve the approved ${missing}. The commit may exist while the site publish or sync is still pending.`,
  };
}
