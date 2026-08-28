import { CATEGORIES } from "./categories";
import { TAXONOMY_GROUPS, type TaxonomyGroupKey } from "./os-taxonomy";

/**
 * Every operator-facing route, so the sidebar can show all of them.
 *
 * The seven-slot category navigation is the front door and stays capped. It is
 * not the whole product: twenty workflows, ten schedules, activity, spend and
 * the SEO run history all had routes and no link, reachable only by typing the
 * URL. A page an operator cannot find is a page that does not exist.
 *
 * `navDirectory()` returns what the sidebar renders below the categories,
 * grouped by `TAXONOMY_GROUPS`. `ALL_NAV_ROUTES` is the full set including the
 * category targets, which the test uses to prove no route is unreachable.
 */

export type NavEntry = {
  readonly to: string;
  readonly label: string;
  readonly hint: string;
  readonly group: TaxonomyGroupKey;
};

/**
 * Routes deliberately absent from navigation, with the reason. A route may only
 * be missing from the sidebar if it is named here — the test enforces that, so
 * a new page cannot quietly become unreachable the way these did.
 */
export const NAV_EXEMPT: Readonly<Record<string, string>> = {
  "/": "the Command center, rendered as its own Start here entry",
  "/operators": "settings, pinned to the foot of the sidebar",
  "/ads/advertisers": "a view inside Competitor ads",
  "/knowledge/manual": "a form reached from Knowledge",
};

const ENTRIES: readonly NavEntry[] = [
  // Decisions — something is waiting on a yes or no.
  {
    to: "/approvals",
    label: "Approvals",
    hint: "Approve or reject with a note",
    group: "decisions",
  },
  { to: "/changes", label: "Page changes", hint: "Edits proposed to the site", group: "decisions" },
  { to: "/keywords", label: "Keywords", hint: "Terms worth winning", group: "decisions" },
  {
    to: "/recommendations",
    label: "Observations",
    hint: "Things the system noticed",
    group: "decisions",
  },
  { to: "/roadmap", label: "Roadmap", hint: "What we are building next", group: "decisions" },
  { to: "/ask", label: "Ask", hint: "Ask the agent anything", group: "decisions" },
  { to: "/studio", label: "Studio", hint: "Think out loud, no tools", group: "decisions" },
  { to: "/notes", label: "Notes", hint: "Your private notes pad", group: "decisions" },

  // Evidence — stored facts the decisions rest on.
  {
    to: "/pages/tools",
    label: "Site pages",
    hint: "Every page, its numbers, and its edit",
    group: "evidence",
  },
  {
    to: "/search/tools",
    label: "Search tools",
    hint: "Search Console reads and inspections",
    group: "evidence",
  },
  {
    to: "/measurement/tools",
    label: "Speed and runs",
    hint: "PageSpeed readings and measurement runs",
    group: "evidence",
  },
  { to: "/authority", label: "Trust gaps", hint: "Missing proof on pages", group: "evidence" },
  {
    to: "/essentials",
    label: "Coverage",
    hint: "What is covered and what is missing",
    group: "evidence",
  },
  { to: "/knowledge", label: "Knowledge", hint: "What the OS knows", group: "evidence" },
  { to: "/assets", label: "Assets", hint: "Everything we own", group: "evidence" },
  { to: "/ads", label: "Competitor ads", hint: "Ads they are running now", group: "evidence" },
  {
    to: "/command-center",
    label: "Evidence",
    hint: "Every stored fact, by source",
    group: "evidence",
  },

  // Run work — the automations that produce evidence and changes.
  { to: "/workflows", label: "Workflows", hint: "Every run you can start", group: "run_work" },
  { to: "/scheduler", label: "Schedule", hint: "When work runs on its own", group: "run_work" },
  {
    to: "/activity",
    label: "Activity",
    hint: "Suggestion to deployment, end to end",
    group: "run_work",
  },
  { to: "/seo-runs", label: "SEO runs", hint: "Governed page changes", group: "run_work" },
  { to: "/agents", label: "Agents", hint: "Who does the work", group: "run_work" },
  { to: "/openseo", label: "SEO tools", hint: "Manual, one-off tool calls", group: "run_work" },
  { to: "/openai-ads", label: "OpenAI Ads", hint: "Pixel instrumentation", group: "run_work" },

  // System health — connections, costs and access.
  // Both were exempted as "a tab inside Connections". They are not: /capabilities
  // links to neither, so the only route to Systems was a link on Registry, which
  // was itself unreachable. "Check connections" and "Sync registry" both live on
  // these two pages, and an operator was told to do both with no way to get there.
  {
    to: "/capabilities/systems",
    label: "Connection health",
    hint: "Check every connector and see what it answered",
    group: "system_health",
  },
  {
    to: "/capabilities/registry",
    label: "Capability registry",
    hint: "Sync capabilities, agents and workflows from code",
    group: "system_health",
  },
  {
    to: "/gaps",
    label: "Connection gaps",
    hint: "Every operation, wired or not",
    group: "system_health",
  },
  { to: "/spend", label: "Data costs", hint: "What data sources cost", group: "system_health" },
];

/** Every route the sidebar links to, including the category targets. */
export const ALL_NAV_ROUTES: readonly string[] = [
  "/",
  "/operators",
  ...CATEGORIES.map((category) => category.to),
  ...ENTRIES.map((entry) => entry.to),
];

export type NavGroup = {
  readonly key: TaxonomyGroupKey;
  readonly label: string;
  readonly entries: readonly NavEntry[];
};

/**
 * The grouped list rendered below the categories. Category targets are dropped
 * so nothing appears twice, and an empty group is omitted rather than rendered
 * as a bare heading.
 */
export function navDirectory(): readonly NavGroup[] {
  const categoryRoutes = new Set(CATEGORIES.map((category) => category.to));
  return TAXONOMY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    entries: ENTRIES.filter((entry) => entry.group === group.key && !categoryRoutes.has(entry.to)),
  })).filter((group) => group.entries.length > 0);
}
