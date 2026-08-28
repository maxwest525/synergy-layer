/**
 * Which source file renders a public URL.
 *
 * Every proposal lane used to assume `GOVERNED_FILE` — the service page data
 * file — whatever URL it was handed. That held only because the one lane that
 * could complete was the service wording lane, and it hid the real limit: a
 * finding on any other page drafted against a file that does not render it, and
 * failed at the "not one unique literal in the allowlisted source file" check
 * with no hint that the page was never fixable in the first place.
 *
 * This is the one place that answers "what would I have to edit to change what
 * this page says". It answers for the URLs the governed change kinds actually
 * cover, and it says plainly that it does not know for the rest. An unknown URL
 * is not a failure to handle later — it is the honest state of a site whose
 * other pages are React components no lane owns yet.
 */

import {
  GOVERNED_CHANGE_KINDS,
  GOVERNED_ORIGIN,
  GOVERNED_PAGE_SOURCES,
  type GovernedChangeKind,
} from "./allowlist";

/**
 * One spelling per address, so `/privacy/` and `/privacy` resolve alike. The
 * site's own canonical for the home page is `/`, which is why an emptied path
 * stays `/` rather than becoming the empty string.
 */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

const PAGE_SOURCE_BY_PATH: Readonly<Record<string, string | undefined>> = GOVERNED_PAGE_SOURCES;

export type PageSource = {
  changeKind: GovernedChangeKind;
  filePath: string;
  /** Why this file, in words an operator reading a refusal can use. */
  because: string;
};

export type PageSourceResolution = { ok: true; source: PageSource } | { ok: false; reason: string };

/**
 * Route shapes the governed change kinds cover, most specific first. A blog
 * post lives in the posts data file; the blog index that lists them is a
 * component, and deliberately absent below.
 */
const ROUTES: readonly {
  match: RegExp;
  changeKind: GovernedChangeKind;
  file: string;
  because: string;
}[] = [
  {
    match: /^\/services\/[^/]+\/?$/,
    changeKind: "service.page_wording",
    file: GOVERNED_CHANGE_KINDS["service.page_wording"][0],
    because: "a service page's wording is a record in the service data file",
  },
  {
    match: /^\/blog\/[^/]+\/?$/,
    changeKind: "content.blog_post",
    file: GOVERNED_CHANGE_KINDS["content.blog_post"][0],
    because: "a blog post's wording is a record in the posts data file",
  },
];

/**
 * Resolve the file that renders `rawUrl`, or say why nothing does.
 *
 * Refuses a URL outside the allowlisted public origin before anything else: a
 * resolver that happily names a source file for someone else's domain is a
 * confused deputy waiting to be pointed at one.
 */
export function resolvePageSource(rawUrl: string): PageSourceResolution {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `${rawUrl || "An empty value"} is not a URL.` };
  }

  if (parsed.origin !== GOVERNED_ORIGIN) {
    return {
      ok: false,
      reason: `${parsed.origin} is not the allowlisted site, so no source file here renders it.`,
    };
  }

  // A page whose wording lives in its own component. Matched on the exact path
  // the client's router declares, because the component name does not follow
  // from the address: /saferweb is SafetyWebPage.tsx.
  const component = PAGE_SOURCE_BY_PATH[normalizePath(parsed.pathname)];
  if (component !== undefined) {
    return {
      ok: true,
      source: {
        changeKind: "page.wording",
        filePath: component,
        because: "this page's wording is written in the component that renders it",
      },
    };
  }

  for (const route of ROUTES) {
    if (route.match.test(parsed.pathname)) {
      return {
        ok: true,
        source: { changeKind: route.changeKind, filePath: route.file, because: route.because },
      };
    }
  }

  return {
    ok: false,
    reason:
      `No governed lane renders ${parsed.pathname}. Wording there lives in a page component, ` +
      `which no change kind owns yet, so this cannot be drafted — it is a manual edit until a ` +
      `lane covers it.`,
  };
}

/** Whether a fix for this URL can be drafted at all. Cheap enough for a verb gate. */
export function hasPageSource(rawUrl: string): boolean {
  return resolvePageSource(rawUrl).ok;
}
