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
import type { FieldChange } from "./execution/source-change";
import type { CheckId } from "./page-checks";
import type { SiteCheckId } from "./site-checks";

export type AuditFixTarget = {
  changeKind: GovernedChangeKind;
  /** The exact governed file the fix writes. */
  filePath: string;
};

const WORDING_FILE = GOVERNED_CHANGE_KINDS["service.title_h1"][0];
const ROBOTS_FILE = GOVERNED_CHANGE_KINDS["site.crawl_directives"][0];

const wording: AuditFixTarget = { changeKind: "service.title_h1", filePath: WORDING_FILE };
const crawl: AuditFixTarget = { changeKind: "site.crawl_directives", filePath: ROBOTS_FILE };

/** Which governed change kind can fix each page level check. */
export const PAGE_CHECK_FIX: Record<CheckId, AuditFixTarget | null> = {
  title_missing: wording,
  title_too_long: wording,
  title_too_short: wording,
  title_duplicate: wording,
  h1_missing: wording,
  h1_multiple: wording,
  h1_duplicate: wording,
  description_missing: null,
  description_too_long: null,
  description_too_short: null,
  description_duplicate: null,
  canonical_missing: null,
  noindex: null,
  nofollow: null,
  viewport_missing: null,
  lang_missing: null,
  structured_data_missing: null,
  structured_data_invalid: null,
  image_alt_missing: null,
  thin_content: null,
  no_internal_links: null,
  og_missing: null,
};

/** Which governed change kind can fix each site level check. */
export const SITE_CHECK_FIX: Record<SiteCheckId, AuditFixTarget | null> = {
  robots_missing: null,
  robots_blocks_site: crawl,
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

  return { error: "That finding has no governed crawl directive fix yet." };
}
