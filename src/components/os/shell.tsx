import { Link, useHydrated, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  BrainCircuit,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  Gauge,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  NotebookPen,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  ListChecks,
  DollarSign,
  FileDiff,
  KeyRound,
  ShieldCheck,
  Swords,
  Tags,
  Users,
  Plug,
  Search,
  Sparkles,
  Route as RouteIcon,
  Workflow,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { SuggestionsPanel } from "./suggestions-panel";
import { TenantSwitcher } from "./tenant-switcher";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { getWorkspaceAccessState } from "@/lib/operator-session-gate";
import { TAXONOMY_GROUPS, type TaxonomyGroupKey } from "@/lib/os-taxonomy";
import { cn } from "@/lib/utils";

type Workspace = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hint: string;
  group: TaxonomyGroupKey;
};

type WorkspaceGroup = { title: string; definition: string; items: readonly Workspace[] };

/**
 * Destinations declare their taxonomy group; the sidebar order comes from
 * `TAXONOMY_GROUPS`, so navigation and page headers can never disagree.
 */
const workspaces: readonly Workspace[] = [
  { to: "/", label: "Today", icon: Inbox, hint: "What needs your yes or no", group: "decisions" },
  { to: "/ask", label: "Ask", icon: Sparkles, hint: "Ask the agent anything", group: "decisions" },
  {
    to: "/essentials",
    label: "Coverage",
    icon: ListChecks,
    hint: "What is covered and what is missing",
    group: "evidence",
  },

  {
    to: "/approvals",
    label: "Approvals",
    icon: CheckCheck,
    hint: "Approve or reject with a note",
    group: "decisions",
  },
  {
    to: "/changes",
    label: "Page changes",
    icon: FileDiff,
    hint: "Edits proposed to the site",
    group: "decisions",
  },
  {
    to: "/keywords",
    label: "Keywords",
    icon: Tags,
    hint: "Terms worth winning",
    group: "decisions",
  },
  {
    to: "/competitors",
    label: "Competitors",
    icon: Swords,
    hint: "Who we rank against",
    group: "decisions",
  },
  {
    to: "/recommendations",
    label: "Observations",
    icon: Lightbulb,
    hint: "Things the system noticed",
    group: "decisions",
  },
  {
    to: "/studio",
    label: "Studio",
    icon: BrainCircuit,
    hint: "Think out loud, no tools",
    group: "decisions",
  },
  {
    to: "/roadmap",
    label: "Roadmap",
    icon: ListChecks,
    hint: "What we are building next",
    group: "decisions",
  },
  {
    to: "/notes",
    label: "Notes",
    icon: NotebookPen,
    hint: "Your private notes pad",
    group: "decisions",
  },

  {
    to: "/command-center",
    label: "Evidence",
    icon: LayoutDashboard,
    hint: "Every stored fact, by source",
    group: "evidence",
  },
  {
    to: "/pages/tools",
    label: "Site pages",
    icon: FileDiff,
    hint: "Every page, its numbers, and its edit",
    group: "evidence",
  },
  {
    to: "/search",
    label: "Search results",
    icon: Search,
    hint: "What Google reports",
    group: "evidence",
  },
  {
    to: "/measurement",
    label: "Site health",
    icon: Gauge,
    hint: "Speed and traffic",
    group: "evidence",
  },
  { to: "/ga4", label: "Analytics", icon: Gauge, hint: "GA4 property reads", group: "evidence" },
  {
    to: "/ads",
    label: "Competitor ads",
    icon: KeyRound,
    hint: "Ads they are running now",
    group: "evidence",
  },
  {
    to: "/authority",
    label: "Trust gaps",
    icon: ShieldCheck,
    hint: "Missing proof on pages",
    group: "evidence",
  },
  { to: "/assets", label: "Assets", icon: Boxes, hint: "Everything we own", group: "evidence" },
  {
    to: "/knowledge",
    label: "Knowledge",
    icon: Radar,
    hint: "What the OS knows",
    group: "evidence",
  },

  {
    to: "/workflows",
    label: "Work",
    icon: Workflow,
    hint: "Runs, schedules, executions",
    group: "run_work",
  },
  {
    to: "/activity",
    label: "Activity",
    icon: Activity,
    hint: "Suggestion to deployment, end to end",
    group: "run_work",
  },
  {
    to: "/scheduler",
    label: "Schedule",
    icon: CalendarClock,
    hint: "When work runs",
    group: "run_work",
  },
  {
    to: "/seo-runs",
    label: "SEO runs",
    icon: RouteIcon,
    hint: "Governed page changes",
    group: "run_work",
  },
  {
    to: "/openseo",
    label: "SEO tools",
    icon: Radar,
    hint: "Manual, one-off tool calls",
    group: "run_work",
  },
  {
    to: "/openai-ads",
    label: "OpenAI Ads",
    icon: Megaphone,
    hint: "Pixel instrumentation",
    group: "run_work",
  },
  { to: "/agents", label: "Agents", icon: Activity, hint: "Who does the work", group: "run_work" },

  {
    to: "/capabilities",
    label: "Setup",
    icon: Plug,
    hint: "Connections, costs, access",
    group: "system_health",
  },
  {
    to: "/gaps",
    label: "Connection gaps",
    icon: Plug,
    hint: "Every operation, wired or not",
    group: "system_health",
  },
  {
    to: "/spend",
    label: "Data costs",
    icon: DollarSign,
    hint: "What data sources cost",
    group: "system_health",
  },
  {
    to: "/operators",
    label: "People",
    icon: Users,
    hint: "Who has access",
    group: "system_health",
  },
] as const;

/**
 * Six destinations carry the whole OS, in the order a day runs: what needs a
 * decision, the agent, the coverage map, the stored facts, the work that
 * produces them, and setup when something breaks. Every other workspace still
 * exists; it lives underneath the destination it belongs to.
 */
type NavSection = {
  primary: Workspace;
  /** Extra routes that also open this section. */
  children: readonly Workspace[];
};

function workspaceAt(route: string): Workspace {
  return workspaces.find((workspace) => workspace.to === route)!;
}

function workspacesAt(routes: readonly string[]): readonly Workspace[] {
  return routes.map(workspaceAt);
}

const navSections: readonly NavSection[] = [
  // Suggestions and page changes are the propose to approve to execute path.
  // They sit under Today so the acting half of the system is visible from
  // every screen instead of being buried inside the SEO coverage map.
  {
    primary: workspaceAt("/"),
    children: workspacesAt(["/approvals", "/recommendations", "/changes", "/roadmap", "/notes"]),
  },

  {
    primary: workspaceAt("/command-center"),
    children: workspacesAt([
      "/search",
      "/keywords",
      "/competitors",
      "/measurement/tools",
      "/ga4",
      "/ads",
      "/authority",
      "/assets",
      "/knowledge",
    ]),
  },
  {
    primary: workspaceAt("/workflows"),
    children: workspacesAt([
      "/activity",
      "/scheduler",
      "/seo-runs",
      "/openseo",
      "/openai-ads",
      "/agents",
    ]),
  },
  {
    primary: workspaceAt("/capabilities"),
    children: workspacesAt(["/gaps", "/spend", "/operators"]),
  },

  // Ask and Coverage are side surfaces, not stages of the daily loop, so they
  // sit below it. Nothing is hidden; they are simply out of the way.
  { primary: workspaceAt("/ask"), children: workspacesAt(["/studio"]) },
  { primary: workspaceAt("/essentials"), children: [] },
];

const allWorkspaces = workspaces;

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

function currentWorkspace(pathname: string): Workspace | undefined {
  return [...allWorkspaces]
    .sort((a, b) => b.to.length - a.to.length)
    .find((workspace) => isActive(pathname, workspace.to));
}

function currentWorkspaceLabel(pathname: string): string {
  return currentWorkspace(pathname)?.label ?? "AOOS";
}

type Crumb = { label: string; to?: string };

/** Turn a trailing detail segment into something readable, never a raw UUID wall. */
function readableSegment(segment: string): string {
  const decoded = decodeURIComponent(segment);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(decoded)) return `${decoded.slice(0, 8)}…`;
  if (decoded.length > 28) return `${decoded.slice(0, 28)}…`;
  return decoded.replace(/[-_.]/g, " ");
}

/**
 * One breadcrumb trail for the whole OS, built from the same taxonomy and nav
 * sections the sidebar reads, so a page can never describe its own location
 * differently from the way you navigated to it.
 */
export function breadcrumbsForPath(pathname: string): readonly Crumb[] {
  const workspace = currentWorkspace(pathname);
  if (!workspace) return [];

  const crumbs: Crumb[] = [{ label: "Today", to: "/" }];

  const section = navSections.find(
    (entry) =>
      entry.primary.to === workspace.to || entry.children.some((c) => c.to === workspace.to),
  );
  if (section && section.primary.to !== workspace.to && section.primary.to !== "/") {
    crumbs.push({ label: section.primary.label, to: section.primary.to });
  }

  if (workspace.to !== "/") {
    crumbs.push({ label: workspace.label, to: workspace.to });
  }

  const rest = pathname
    .slice(workspace.to === "/" ? 1 : workspace.to.length)
    .split("/")
    .filter(Boolean);
  for (const segment of rest) {
    crumbs.push({ label: readableSegment(segment) });
  }

  return crumbs;
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = breadcrumbsForPath(pathname);
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="text-muted-foreground/50">
                  /
                </span>
              ) : null}
              {crumb.to && !last ? (
                <Link to={crumb.to} className="transition-colors hover:text-primary">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last && "text-foreground")}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NavRow({
  workspace,
  pathname,
  onNavigate,
  collapsed,
  nested = false,
}: {
  workspace: Workspace;
  pathname: string;
  onNavigate?: (() => void) | undefined;
  collapsed: boolean;
  nested?: boolean;
}) {
  const active = isActive(pathname, workspace.to);
  return (
    <li className="relative">
      {active && !collapsed ? (
        <span
          aria-hidden
          className="absolute -left-2 top-1/2 h-6 w-px -translate-y-1/2 bg-primary shadow-[0_0_10px_var(--color-primary)]"
        />
      ) : null}
      <Link
        to={workspace.to}
        onClick={onNavigate}
        title={collapsed ? workspace.label : undefined}
        aria-label={collapsed ? workspace.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center rounded-lg text-sm transition-colors",
          collapsed ? "size-10 justify-center" : "gap-3 px-2.5 py-2",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
        )}
      >
        <workspace.icon
          aria-hidden
          className={cn(
            "shrink-0",
            nested ? "size-3.5" : "size-4",
            active ? "text-primary" : "text-foreground/90",
          )}
        />
        {collapsed ? null : (
          <span className="min-w-0 flex-1 leading-tight">
            <span className={cn("block truncate", nested ? "text-[0.8rem]" : "font-medium")}>
              {workspace.label}
            </span>
            {nested ? null : (
              <span className="block truncate text-xs text-foreground/70">{workspace.hint}</span>
            )}
          </span>
        )}
      </Link>
    </li>
  );
}

const COLLAPSED_SECTIONS_KEY = "aoos.nav.collapsed-sections";

/**
 * Every sub-destination is always listed. Nothing hides itself just because
 * you are standing somewhere else, so the whole system stays observable from
 * any screen. A section can be folded away by hand, and that choice persists.
 */
function NavList({
  pathname,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const [foldedSections, setFoldedSections] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      if (stored) setFoldedSections(JSON.parse(stored) as string[]);
    } catch {
      setFoldedSections([]);
    }
  }, []);

  const toggleSection = (key: string) => {
    setFoldedSections((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      try {
        window.localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // A browser that refuses storage still gets working navigation.
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      {navSections.map((section, index) => {
        const folded = foldedSections.includes(section.primary.to);
        const showChildren = !collapsed && !folded && section.children.length > 0;
        return (
          <section
            key={section.primary.to}
            aria-label={section.primary.label}
            className={cn("py-3", index > 0 && "border-t border-border/50", index === 0 && "pt-0")}
          >
            <ul
              className={cn(
                "relative flex flex-col gap-1",
                collapsed ? "items-center" : "border-l border-border/40 pl-2",
              )}
            >
              <li className="relative flex items-center">
                <span className="min-w-0 flex-1">
                  <ul>
                    <NavRow
                      workspace={section.primary}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      collapsed={collapsed}
                    />
                  </ul>
                </span>
                {collapsed || section.children.length === 0 ? null : (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.primary.to)}
                    aria-expanded={!folded}
                    aria-label={
                      folded
                        ? `Show the ${section.children.length} pages inside ${section.primary.label}`
                        : `Hide the pages inside ${section.primary.label}`
                    }
                    className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
                  >
                    <span>{section.children.length}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn("size-3.5 transition-transform", folded && "-rotate-90")}
                    />
                  </button>
                )}
              </li>
              {showChildren
                ? section.children.map((child) => (
                    <NavRow
                      key={child.to}
                      workspace={child}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      collapsed={collapsed}
                      nested
                    />
                  ))
                : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-2 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]"
      />
      <span className="text-sm font-semibold tracking-tight text-foreground">AOOS</span>
      <span className="text-xs text-muted-foreground">Marketing OS</span>
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = useOperatorSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(false);

  // Remember the operator's rail preference across visits.
  useEffect(() => {
    setNavCollapsed(window.localStorage.getItem("aoos.nav.collapsed") === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("aoos.nav.collapsed", navCollapsed ? "1" : "0");
  }, [navCollapsed]);

  const onAuthRoute = pathname.startsWith("/auth");
  const hydrated = useHydrated();
  const accessState = getWorkspaceAccessState({
    ready: session.ready,
    signedIn: session.signedIn,
    onAuthRoute,
  });

  // A route change while the drawer is open should leave the new page visible.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Signing in is its own page, not a banner bolted onto every workspace.
  useEffect(() => {
    if (accessState !== "signed-out") return;
    void navigate({
      to: "/auth",
      search: pathname === "/" ? {} : { next: pathname },
      replace: true,
    });
  }, [accessState, navigate, pathname]);

  const accountLabel = session.signedIn ? (session.email ?? "Operator") : "Operator sign in";

  // Signing in is its own page: no sidebar, no workspace header, no drawer.
  if (onAuthRoute) {
    return (
      <div className="relative min-h-screen w-full bg-background">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_15%_-10%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_70%)]"
        />
        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 sm:px-6">
          <div className="mb-6">
            <BrandMark />
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_15%_-10%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_70%)]"
      />
      <div className="relative flex min-h-screen w-full">
        <nav
          aria-label="Workspaces"
          className={cn(
            "scrollbar-none sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-sidebar/70 py-5 backdrop-blur-xl transition-[width] duration-200 lg:flex",
            navCollapsed ? "w-[4.5rem] px-2" : "w-72 px-4",
          )}
        >
          <div
            className={cn(
              "mb-5 flex items-center gap-2",
              navCollapsed ? "flex-col" : "justify-between px-2.5",
            )}
          >
            {navCollapsed ? null : (
              <Link to="/">
                <BrandMark />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setNavCollapsed((open) => !open)}
              aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!navCollapsed}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-foreground/80 transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {navCollapsed ? (
                <PanelLeftOpen aria-hidden className="size-4" />
              ) : (
                <PanelLeftClose aria-hidden className="size-4" />
              )}
            </button>
          </div>

          {navCollapsed ? null : (
            <div className="pb-4">
              <TenantSwitcher session={session} />
            </div>
          )}

          {session.signedIn ? (
            <div className={cn("pb-4", navCollapsed && "flex justify-center")}>
              <SuggestionsPanel collapsed={navCollapsed} />
            </div>
          ) : null}

          <div className="flex-1 border-t border-border/50 pt-4">
            <NavList pathname={pathname} collapsed={navCollapsed} />
          </div>

          <Link
            to="/auth"
            title={navCollapsed ? accountLabel : undefined}
            className={cn(
              "mt-4 block truncate border-t border-border/50 pt-4 text-sm font-medium text-foreground transition-colors hover:text-primary",
              navCollapsed ? "text-center text-xs" : "px-2.5",
            )}
          >
            {navCollapsed ? "Account" : accountLabel}
          </Link>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                aria-label="Open workspace menu"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Menu aria-hidden className="size-4" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="scrollbar-none flex w-[21rem] flex-col overflow-y-auto border-border/60 bg-sidebar px-4 py-6"
              >
                <div className="mb-5 px-2.5">
                  <BrandMark />
                </div>
                <div className="pb-4">
                  <TenantSwitcher session={session} />
                </div>
                <div className="flex-1 border-t border-border/50 pt-4">
                  <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                </div>
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="mt-4 block truncate border-t border-border/50 px-2.5 pt-4 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
                >
                  {accountLabel}
                </Link>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
                AOOS
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {currentWorkspaceLabel(pathname)}
              </p>
            </div>

            {session.signedIn ? <SuggestionsPanel collapsed /> : null}
          </header>

          <main className="mx-auto w-full max-w-[84rem] flex-1 px-5 py-6 md:px-8 md:py-8">
            {accessState === "ready" ? <Breadcrumbs pathname={pathname} /> : null}
            {accessState === "loading" || accessState === "signed-out" ? (
              <div className="rounded-2xl border border-border/60 px-4 py-6" role="status">
                <p className="text-sm text-muted-foreground">
                  {/* Before hydration the browser session is unknown, so the
                      server and the first client render must say the same thing. */}
                  {!hydrated || accessState === "loading"
                    ? "Checking operator session…"
                    : "Taking you to sign in…"}
                </p>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
