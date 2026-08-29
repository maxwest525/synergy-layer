/**
 * One fix map for the whole audit.
 *
 * There is no separate "title and H1 feature": every audit finding, page level
 * or site level, resolves through this single map to the governed change kind
 * that owns its fix, or to null when no change kind owns it yet. The UI never
 * decides fixability itself, and no check gets its own bespoke action.
 */

import type { GovernedChangeKind } from "./execution/allowlist";
import { GOVERNED_CHANGE_KINDS } from "./execution/allowlist";
import { resolvePageSource } from "./execution/page-source-map";
import type { FieldChange } from "./execution/source-change";
import type { CheckId } from "./page-checks";
import { isRobotsPathAllowed } from "./robots-rules";
import type { SiteCheckId } from "./site-checks";

export type AuditFixTarget = {
  changeKind: GovernedChangeKind;
  /** The exact governed file the fix writes. */
  filePath: string;
};

const WORDING_FILE = GOVERNED_CHANGE_KINDS["service.page_wording"][0];
const ROBOTS_FILE = GOVERNED_CHANGE_KINDS["site.crawl_directives"][0];

const METADATA_FILE = GOVERNED_CHANGE_KINDS["page.metadata"][0];

const wording: AuditFixTarget = { changeKind: "service.page_wording", filePath: WORDING_FILE };
const crawl: AuditFixTarget = { changeKind: "site.crawl_directives", filePath: ROBOTS_FILE };
const metadata: AuditFixTarget = { changeKind: "page.metadata", filePath: METADATA_FILE };

/** Which governed change kind can fix each page level check. */
export const PAGE_CHECK_FIX: Record<CheckId, AuditFixTarget | null> = {
  title_missing: wording,
  title_too_long: wording,
  title_too_short: wording,
  title_duplicate: wording,
  h1_missing: wording,
  h1_multiple: wording,
  h1_duplicate: wording,
  // Still null, but no longer for the reason it was: the wording lane DOES own
  // `subheading` now (20260828160000), so rewriting a subheading is drafted,
  // applied and proven like any other wording change.
  //
  // `h2_missing` fires when a page has NO H2 at all, and the executor's only
  // mechanic is exact string replacement -- `implementation_method` is
  // literally `github_exact_replacement`. Adding a heading is an insertion:
  // there is no `before` text to match, so there is nothing for the executor to
  // replace and nothing for the rendered proof to have expected. A fix target
  // here would offer a draft that still could not be written.
  //
  // What would close this is a governed insertion mechanic -- an anchor to
  // insert relative to, and a proof that reads the new heading's position
  // rather than a replaced string. That is a different change kind, not a
  // wider wording lane.
  h2_missing: null,
  description_missing: metadata,
  description_too_long: metadata,
  description_too_short: metadata,
  description_duplicate: metadata,
  canonical_missing: null,
  noindex: null,
  nofollow: null,
  viewport_missing: null,
  lang_missing: null,
  structured_data_missing: null,
  structured_data_invalid: null,
  structured_data_type_missing: null,
  image_alt_missing: null,
  image_dimensions_missing: null,
  thin_content: null,
  no_internal_links: null,
  og_missing: null,
  url_underscores: null,
  url_query_string: null,
  orphan_page: null,
  url_redirects: null,
  canonical_chain: null,
  meta_refresh: null,
};

/** Which governed change kind can fix each site level check. */
export const SITE_CHECK_FIX: Record<SiteCheckId, AuditFixTarget | null> = {
  robots_missing: null,
  robots_blocks_site: crawl,
  // Fixable, because the site already answered which way. The finding only
  // fires for pages the sitemap declares, so the owner has already said they
  // want them indexed; removing the rule that contradicts that is the fix.
  robots_blocks_pages: crawl,
  sitemap_missing: null,
  sitemap_unreachable: null,
  sitemap_empty: null,
  sitemap_not_declared: crawl,
  sitemap_coverage_gap: null,
  pages_unreadable: null,
};

export function fixTargetForPageCheck(check: string): AuditFixTarget | null {
  return PAGE_CHECK_FIX[check as CheckId] ?? null;
}

/**
 * Change kinds whose file renders one specific page, as opposed to a sitewide
 * component every page shares.
 *
 * The distinction is the whole point of `fixTargetForPage`. A description
 * defect is drafted against the sitewide metadata components, so it can be
 * offered on any page. A title or headline defect has to be edited where that
 * page's wording actually lives, so it can only be offered when some governed
 * file renders that page.
 */
const PAGE_SCOPED_KINDS: ReadonlySet<GovernedChangeKind> = new Set([
  "service.page_wording",
  "content.blog_post",
]);

/**
 * The fix target for a finding at a specific address, or null when nothing can
 * draft it.
 *
 * `fixTargetForPageCheck` answers from the check id alone, which is enough to
 * say which lane owns a defect but not whether that lane can reach the page.
 * Every page-scoped check mapped to the service wording lane whatever address
 * it carried, so a title finding on `/privacy` drew a Draft button and then
 * died inside the proposal lane at the source resolver — the operator saw a
 * control that ran, failed, and blamed the page. Asking the resolver here, before
 * the button exists, is what keeps that from being offered at all.
 *
 * It also returns the resolved kind and file rather than the map's default, so
 * a blog post's title fix reports the posts data file it will really write.
 *
 * Known residual gap, stated rather than implied. This answers "does a governed
 * file render this page", which is a question about routing. It cannot answer
 * "is this page's wording editable", which is a question about that file's
 * contents: `preparePageWordingProposal` additionally requires the live title and
 * the live H1 to each occur exactly once in the source. Two of the governed
 * components fail that today, both checked against the client repository on
 * 2026-08-22:
 *   - ContactPage.tsx repeats "Contact a TruMove Specialist" in the SeoHead
 *     title and again in a visually hidden <h1>.
 *   - ServicesPage.tsx repeats "Moving Services | TruMove" in the SeoHead title
 *     and again in a structured-data name field.
 * Answering this here would mean reading every governed component out of the
 * client repository on each render of the audit panel, so it stays where it is.
 * The refusal names the file and the reason, so the operator is told what is
 * wrong rather than that the page is at fault -- but it is still a button that
 * errors, on those two pages.
 */
export function fixTargetForPage(check: string, targetUrl: string | null): AuditFixTarget | null {
  const target = fixTargetForPageCheck(check);
  if (!target || !PAGE_SCOPED_KINDS.has(target.changeKind)) return target;
  if (targetUrl === null) return null;
  const resolved = resolvePageSource(targetUrl);
  if (!resolved.ok) return null;
  return { changeKind: resolved.source.changeKind, filePath: resolved.source.filePath };
}

/**
 * Why no fix is offered for this finding, in the operator's words, or null when
 * one is. An absent button is only honest if the absence is stated.
 */
export function noFixReasonForPage(check: string, targetUrl: string | null): string | null {
  if (fixTargetForPage(check, targetUrl) !== null) return null;
  const target = fixTargetForPageCheck(check);
  if (!target) return "No governed lane owns this check yet, so it stays a manual fix.";
  if (targetUrl === null) return "This finding names no page address, so nothing can be drafted.";
  const resolved = resolvePageSource(targetUrl);
  return resolved.ok ? null : resolved.reason;
}

export function fixTargetForSiteCheck(check: string): AuditFixTarget | null {
  return SITE_CHECK_FIX[check as SiteCheckId] ?? null;
}

export type CrawlDirectiveFix = {
  title: string;
  rationale: string;
  changes: FieldChange[];
};

/**
 * Turn a site level crawl directive finding into the exact before/after edit to
 * robots.txt. Every edit is one literal replacement that must occur exactly
 * once, so the executor can refuse on drift rather than guess.
 */
export function buildCrawlDirectiveFix(input: {
  check: SiteCheckId;
  robotsContent: string;
  sitemapUrl: string | null;
  /** Paths the sitemap declares that robots.txt disallows. */
  blockedPaths?: readonly string[];
  /** The crawler the finding was measured for, so the fix matches it. */
  userAgent?: string;
}): CrawlDirectiveFix | { error: string } {
  const content = input.robotsContent;

  if (input.check === "sitemap_not_declared") {
    if (!input.sitemapUrl) {
      return { error: "No reachable sitemap address was read, so none can be declared." };
    }
    if (content.includes(input.sitemapUrl)) {
      return { error: "That sitemap address is already declared in robots.txt." };
    }
    const tail = content.replace(/\s+$/, "").split(/\r?\n/).at(-1) ?? "";
    if (!tail) return { error: "robots.txt is empty, so there is no line to append after." };
    return {
      title: "Declare the sitemap in robots.txt",
      rationale: `robots.txt does not point crawlers at ${input.sitemapUrl}. Declaring it lets Google discover every listed page without relying on internal links alone.`,
      changes: [
        {
          field: "robots_txt",
          label: "robots.txt sitemap line",
          before: tail,
          after: `${tail}\nSitemap: ${input.sitemapUrl}`,
        },
      ],
    };
  }

  if (input.check === "robots_blocks_site") {
    const blocking = /^\s*Disallow:\s*\/\s*$/m.exec(content)?.[0];
    if (!blocking) {
      return { error: "No site wide Disallow line was found to remove." };
    }
    return {
      title: "Stop robots.txt blocking the whole site",
      rationale:
        "robots.txt disallows every crawler from every address, so no page can be indexed. Removing the site wide block restores crawling.",
      changes: [
        {
          field: "robots_txt",
          label: "robots.txt site wide block",
          before: blocking,
          after: "Disallow:",
        },
      ],
    };
  }

  if (input.check === "robots_blocks_pages") {
    return buildUnblockFix(content, input.blockedPaths ?? [], input.userAgent);
  }

  return { error: "That finding has no governed crawl directive fix yet." };
}

/**
 * Remove the one rule that is hiding the pages the sitemap declares.
 *
 * Deliberately narrow. It edits only when a single `Disallow` line accounts for
 * every blocked page, because that is the case where the owner\'s intent is not
 * in doubt: they listed the pages for indexing and one stray rule contradicts
 * it. When several rules are involved the edit stops being one obvious
 * correction and becomes a judgement about which pages were meant to be
 * private, so it refuses and says which rules are in play.
 *
 * The line is replaced with a bare `Disallow:`, which is valid and means "allow
 * everything", rather than deleted. Deleting a line shifts everything below it,
 * and the executor matches on an exact literal occurring exactly once.
 */
function buildUnblockFix(
  content: string,
  blocked: readonly string[],
  userAgent = "Googlebot",
): CrawlDirectiveFix | { error: string } {
  if (blocked.length === 0) {
    return { error: "No blocked page addresses were carried with this finding." };
  }

  // The finding read the live robots.txt; this reads the governed file in the
  // repository. They drift, so what is actually blocked is re-established here
  // rather than assumed from the finding.
  const stillBlocked = blocked.filter((path) => !isRobotsPathAllowed(content, path, userAgent));
  if (stillBlocked.length === 0) {
    return {
      error:
        "The robots.txt in the governed source does not block these pages, so there is nothing to change. The live file the audit read may be out of date with the repository.",
    };
  }

  const culprits = blockingRules(content, stillBlocked, userAgent);
  if (culprits.length === 0) {
    return {
      error:
        "No single Disallow line accounts for these pages on its own, so there is nothing unambiguous to remove.",
    };
  }
  if (culprits.length > 1) {
    return {
      error: `${culprits.length} separate rules block these pages (${culprits.join(", ")}). Removing them one at a time is a decision about which pages should stay private, so it is not proposed automatically.`,
    };
  }

  const rule = culprits[0]!;
  const without = emptyRule(content, rule);
  const remaining = stillBlocked.filter((path) => !isRobotsPathAllowed(without, path, userAgent));
  if (remaining.length > 0) {
    return {
      error: `Removing ${rule} would still leave ${remaining.length} of these pages blocked by another rule, so it is not the whole fix and is not proposed on its own.`,
    };
  }

  const line = lineFor(content, rule);
  if (!line) return { error: `The rule ${rule} could not be located as a single line to replace.` };

  const count = stillBlocked.length;
  return {
    title: "Stop robots.txt blocking pages your sitemap lists",
    rationale: `Your sitemap asks Google to index ${count} ${count === 1 ? "page" : "pages"} that robots.txt disallows, so Google is told to index what it is not allowed to read. Removing ${rule} resolves the contradiction in favour of what the sitemap already declares.`,
    changes: [
      {
        field: "robots_txt",
        label: `robots.txt rule ${rule}`,
        before: line,
        // Emptied rather than deleted: a bare Disallow is valid and means allow
        // everything, and the executor matches an exact literal occurring
        // exactly once, so removing the line would shift every line under it.
        after: "Disallow:",
      },
    ],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleLinePattern(rule: string, flags: string): RegExp {
  return new RegExp(`^[ \\t]*Disallow:[ \\t]*${escapeRegExp(rule)}[ \\t]*$`, flags);
}

function lineFor(content: string, rule: string): string | null {
  return ruleLinePattern(rule, "im").exec(content)?.[0] ?? null;
}

function emptyRule(content: string, rule: string): string {
  return content.replace(ruleLinePattern(rule, "gim"), "Disallow:");
}

/**
 * Which `Disallow` rules are actually doing the blocking.
 *
 * Established by emptying one rule at a time and re-asking the matcher, rather
 * than by reasoning about the rule text. Precedence, wildcards, anchors and
 * user-agent groups are then handled by the one implementation that already
 * knows them, and an `Allow` carve-out that makes a rule irrelevant correctly
 * keeps it off this list.
 */
function blockingRules(content: string, blocked: readonly string[], userAgent: string): string[] {
  const rules = [
    ...new Set(
      [...content.matchAll(/^[ \t]*Disallow:[ \t]*(\S+)[ \t]*$/gim)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      ),
    ),
  ];
  return rules.filter((rule) => {
    const without = emptyRule(content, rule);
    // This rule matters if emptying it frees any page that was blocked.
    return blocked.some((path) => isRobotsPathAllowed(without, path, userAgent));
  });
}
