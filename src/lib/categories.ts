/**
 * The seven-slot navigation the redesign replaces the old ~30 routes with.
 *
 * This module is the single source of truth for what the nav contains. The icon
 * rail, the secondary panel, the breadcrumb, and the Command center's queue
 * overview all read it, so they can never disagree about what a category is
 * called or where it lives.
 *
 * The cap is permanent and deliberate: a new feature goes *inside* a category,
 * never beside one. `categories.test.ts` enforces it.
 */

/** Categories the nav may ever hold, excluding the Command center and settings. */
export const CATEGORY_NAV_CAP = 7;

/**
 * Icon names, resolved to lucide components at the component boundary. Keeping
 * them as strings here leaves this module pure and testable in the node-only
 * vitest environment.
 */
export type CategoryIcon =
  "grid" | "search" | "line-chart" | "file-text" | "bar-chart" | "gauge" | "plug" | "settings";

export type CategoryId = "search" | "visitors" | "pages" | "competition" | "health" | "connections";

export type Category = {
  readonly id: CategoryId;
  /**
   * The category's permanent identity, and the route its own page will own
   * (`/getting-found-on-google`) once that page is built.
   */
  readonly slug: string;
  /**
   * Where the nav points today.
   *
   * Each phase builds one category page; until a category's page exists, its
   * nav item points at the route it is absorbing, so the new navigation is
   * usable from the first phase and no item is ever a stub. When a category
   * page lands, this becomes `/${slug}` and nothing else has to change.
   */
  readonly to: string;
  /** The real page title, in plain words. */
  readonly title: string;
  /** One sentence saying what the page is for. */
  readonly purpose: string;
  readonly icon: CategoryIcon;
  /**
   * What one waiting item in this category is called, in plain words, so the
   * Command center's stat line reads as a consequence rather than as a count of
   * abstract "items".
   */
  readonly waiting: { readonly one: string; readonly many: string };
};

/**
 * Order is the spec table's order, which is the order a day runs: what Google
 * sees, who arrives, the pages themselves, the competition, the plumbing, then
 * setup when something breaks.
 */
export const CATEGORIES: readonly Category[] = [
  {
    id: "search",
    slug: "getting-found-on-google",
    to: "/search",
    title: "Getting found on Google",
    purpose: "What people search for, and whether your pages show up for it.",
    icon: "search",
    waiting: { one: "search fix waiting", many: "search fixes waiting" },
  },
  {
    id: "visitors",
    slug: "who-visits-your-site",
    to: "/ga4",
    title: "Who visits your site",
    purpose: "Who arrives, where they come from, and what they do once they land.",
    icon: "line-chart",
    waiting: { one: "visitor finding waiting", many: "visitor findings waiting" },
  },
  {
    id: "pages",
    slug: "your-pages",
    to: "/pages",
    title: "Your pages",
    purpose: "Every page on your site, what is wrong with it, and the fix waiting for you.",
    icon: "file-text",
    waiting: { one: "page fix waiting", many: "page fixes waiting" },
  },
  {
    id: "competition",
    slug: "your-competition",
    to: "/competitors",
    title: "Your competition",
    purpose: "Who you rank against, and where they are beating you.",
    icon: "bar-chart",
    waiting: { one: "competitor finding waiting", many: "competitor findings waiting" },
  },
  {
    id: "health",
    slug: "site-health",
    to: "/measurement",
    title: "Site health",
    purpose: "Whether your site loads fast and whether Google can read it.",
    icon: "gauge",
    waiting: { one: "site check waiting", many: "site checks waiting" },
  },
  {
    id: "connections",
    slug: "connections",
    to: "/capabilities",
    title: "Connections",
    purpose: "The accounts this system reads from, and what is still unfinished.",
    icon: "plug",
    waiting: { one: "connection to finish", many: "connections to finish" },
  },
] as const;

export type NavEntry =
  | { readonly kind: "home"; readonly to: "/"; readonly title: string; readonly icon: CategoryIcon }
  | {
      readonly kind: "category";
      readonly to: string;
      readonly title: string;
      readonly icon: CategoryIcon;
      readonly category: Category;
    }
  | {
      readonly kind: "settings";
      readonly to: string;
      readonly title: string;
      readonly icon: CategoryIcon;
    };

export const HOME_TITLE = "Command center";

/**
 * The icon rail, top to bottom: Command center, every category, then settings
 * pinned to the foot. Nothing else is ever added here.
 */
export function navEntries(): readonly NavEntry[] {
  return [
    { kind: "home", to: "/", title: HOME_TITLE, icon: "grid" },
    ...CATEGORIES.map((category): NavEntry => ({
      kind: "category",
      to: category.to,
      title: category.title,
      icon: category.icon,
      category,
    })),
    { kind: "settings", to: "/operators", title: "People and access", icon: "settings" },
  ];
}

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The category a path belongs to, matching both where the nav points today and
 * the category's own reserved route, plus any view nested under either. Matching
 * the reserved route already means a phase can land its page without touching
 * the breadcrumb.
 *
 * A path that merely shares a prefix (`/your-pages-archive`) is not a match, so
 * an unlinked legacy route can never light up a category.
 */
export function categoryForPath(pathname: string): Category | undefined {
  return CATEGORIES.find(
    (category) => matches(pathname, category.to) || matches(pathname, `/${category.slug}`),
  );
}

export type Crumb = { readonly label: string; readonly to?: string };

/** "page-changes" or "seo_runs" as words an operator reads, per the copy rules. */
function humanizeSegment(segment: string): string {
  const words = segment.replace(/[-_]+/g, " ").trim();
  return words.length === 0 ? segment : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * `trumoveinc.com › Categories › <page>`, as the boards show it.
 *
 * The property crumb is omitted rather than faked when no property is
 * connected. A route outside the category nav used to get no trail at all,
 * which meant the trail vanished on exactly the deep pages an operator gets
 * lost on; it now reads property › Command center › <page>, so every page in
 * the application carries a clickable way back to the start.
 */
export function breadcrumbsForPath(pathname: string, property: string | null): readonly Crumb[] {
  const propertyCrumb: readonly Crumb[] = property === null ? [] : [{ label: property }];

  if (pathname === "/") {
    return [...propertyCrumb, { label: HOME_TITLE, to: "/" }];
  }

  const category = categoryForPath(pathname);
  if (!category) {
    // The first path segment names the workspace; deeper segments are ids and
    // views that the page's own heading already names.
    const segment = pathname.split("/").filter(Boolean)[0];
    if (!segment) return [...propertyCrumb, { label: HOME_TITLE, to: "/" }];
    return [
      ...propertyCrumb,
      { label: HOME_TITLE, to: "/" },
      { label: humanizeSegment(segment), to: `/${segment}` },
    ];
  }

  return [...propertyCrumb, { label: "Categories" }, { label: category.title, to: category.to }];
}
