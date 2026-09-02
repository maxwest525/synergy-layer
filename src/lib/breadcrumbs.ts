import { HOME_TITLE, categoryForPath, navEntries } from "./categories";
import { navLabelFor } from "./nav-directory";

/**
 * The trail at the top of every page: property › Categories › page, or
 * property › Command center › page for a route outside the categories.
 *
 * Every label comes from a name a person wrote: the category model, the
 * sidebar, or the two maps below. The trail used to derive the last crumb from
 * the URL ("Seo runs", "Openseo", "Openai ads") and, on a nested view such as
 * /search/tools, to stop at the category, so the bold current crumb said
 * "Getting found on Google" while the heading said "Search results" and the
 * one link an operator wanted, back to the category, was the one crumb that
 * was not a link (NAV-8). Now an ancestor is always a link and the current
 * crumb names the page the operator is on.
 */

export type Crumb = { readonly label: string; readonly to?: string };

/** Views inside a section that the sidebar does not list on their own. */
const VIEW_TITLES: Readonly<Record<string, string>> = {
  "/ads/advertisers": "Advertisers",
  "/knowledge/manual": "Execution Handbook",
};

/**
 * What one row under a list is called. The page heading carries the row's own
 * name; the crumb says what kind of thing it is, so the list crumb above it
 * becomes the way back.
 */
const DETAIL_KINDS: Readonly<Record<string, string>> = {
  "/agents": "Agent",
  "/assets": "Asset",
  "/capabilities": "Capability",
  "/capabilities/systems": "System",
  "/changes": "Page change",
  "/knowledge": "Collection",
  "/recommendations": "Observation",
  "/scheduler": "Schedule",
  "/seo-runs": "SEO run",
  "/workflows": "Workflow",
};

function labelFor(prefix: string, parent: string): string | undefined {
  return (
    navEntries().find((entry) => entry.to === prefix)?.title ??
    navLabelFor(prefix) ??
    VIEW_TITLES[prefix] ??
    DETAIL_KINDS[parent]
  );
}

/** One crumb per path segment below `base`, each named or, when nothing names it, left out. */
function crumbsBelow(base: string, pathname: string): Crumb[] {
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let prefix = base;
  for (const segment of rest) {
    const parent = prefix;
    prefix = `${prefix === "/" ? "" : prefix}/${segment}`;
    const label = labelFor(prefix, parent);
    if (label !== undefined) crumbs.push({ label, to: prefix });
  }
  return crumbs;
}

export function breadcrumbsForPath(pathname: string, property: string | null): readonly Crumb[] {
  const propertyCrumb: readonly Crumb[] = property === null ? [] : [{ label: property }];
  const home: Crumb = { label: HOME_TITLE, to: "/" };
  if (pathname === "/") return [...propertyCrumb, home];

  const category = categoryForPath(pathname);
  if (!category) return [...propertyCrumb, home, ...crumbsBelow("/", pathname)];

  // The category is reached by the route it absorbs today or by its own slug;
  // whichever the path uses is the base the nested view hangs off.
  const base =
    pathname === category.to || pathname.startsWith(`${category.to}/`)
      ? category.to
      : `/${category.slug}`;
  return [
    ...propertyCrumb,
    { label: "Categories" },
    { label: category.title, to: category.to },
    ...crumbsBelow(base, pathname),
  ];
}
