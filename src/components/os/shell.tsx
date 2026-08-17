import { Link, useHydrated, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  BrainCircuit,
  CalendarClock,
  Gauge,
  Inbox,
  LayoutDashboard,
  Lightbulb,
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
  { to: "/essentials", label: "Coverage", icon: ListChecks, hint: "What is covered and what is missing", group: "evidence" },

  { to: "/changes", label: "Page changes", icon: FileDiff, hint: "Edits proposed to the site", group: "decisions" },
  { to: "/keywords", label: "Keywords", icon: Tags, hint: "Terms worth winning", group: "decisions" },
  { to: "/competitors", label: "Competitors", icon: Swords, hint: "Who we rank against", group: "decisions" },
  { to: "/recommendations", label: "Observations", icon: Lightbulb, hint: "Things the system noticed", group: "decisions" },
  { to: "/studio", label: "Studio", icon: BrainCircuit, hint: "Think out loud, no tools", group: "decisions" },

  { to: "/command-center", label: "Overview", icon: LayoutDashboard, hint: "How everything stands", group: "evidence" },
  { to: "/search", label: "Search results", icon: Search, hint: "What Google reports", group: "evidence" },
  { to: "/measurement", label: "Site health", icon: Gauge, hint: "Speed and traffic", group: "evidence" },
  { to: "/ads", label: "Competitor ads", icon: KeyRound, hint: "Ads they are running now", group: "evidence" },
  { to: "/authority", label: "Trust gaps", icon: ShieldCheck, hint: "Missing proof on pages", group: "evidence" },
  { to: "/assets", label: "Assets", icon: Boxes, hint: "Everything we own", group: "evidence" },
  { to: "/knowledge", label: "Knowledge", icon: Radar, hint: "What the OS knows", group: "evidence" },

  { to: "/workflows", label: "Workflows", icon: Workflow, hint: "How work runs", group: "run_work" },
  { to: "/scheduler", label: "Schedule", icon: CalendarClock, hint: "When work runs", group: "run_work" },
  { to: "/seo-runs", label: "SEO runs", icon: RouteIcon, hint: "Governed page changes", group: "run_work" },
  { to: "/openseo", label: "SEO tools", icon: Radar, hint: "Manual, one-off tool calls", group: "run_work" },
  { to: "/openai-ads", label: "OpenAI Ads", icon: Megaphone, hint: "Pixel instrumentation", group: "run_work" },
  { to: "/agents", label: "Agents", icon: Activity, hint: "Who does the work", group: "run_work" },

  { to: "/capabilities", label: "Capabilities", icon: Plug, hint: "What the OS can do", group: "system_health" },
  { to: "/spend", label: "Data costs", icon: DollarSign, hint: "What data sources cost", group: "system_health" },
  { to: "/operators", label: "People", icon: Users, hint: "Who has access", group: "system_health" },
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
  { primary: workspaceAt("/"), children: [] },
  { primary: workspaceAt("/ask"), children: workspacesAt(["/studio"]) },
  {
    primary: workspaceAt("/essentials"),
    children: workspacesAt(["/changes", "/recommendations"]),
  },
  {
    primary: workspaceAt("/command-center"),
    children: workspacesAt([
      "/search",
      "/keywords",
      "/competitors",
      "/measurement",
      "/ads",
      "/authority",
      "/assets",
      "/knowledge",
    ]),
  },
  {
    primary: workspaceAt("/workflows"),
    children: workspacesAt(["/scheduler", "/seo-runs", "/openseo", "/openai-ads", "/agents"]),
  },
  {
    primary: workspaceAt("/capabilities"),
    children: workspacesAt(["/spend", "/operators"]),
  },
];

const allWorkspaces = workspaces;





function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

function currentWorkspaceLabel(pathname: string): string {
  const match = [...allWorkspaces]
    .sort((a, b) => b.to.length - a.to.length)
    .find((workspace) => isActive(pathname, workspace.to));
  return match?.label ?? "AOOS";
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

function NavList({
  pathname,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {navSections.map((section, index) => {
        const sectionActive =
          isActive(pathname, section.primary.to) ||
          section.children.some((child) => isActive(pathname, child.to));
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
              <NavRow
                workspace={section.primary}
                pathname={pathname}
                onNavigate={onNavigate}
                collapsed={collapsed}
              />
              {/* Sub-destinations only unfold once you are working in the
                  section, so the rail stays six choices wide by default. */}
              {collapsed || !sectionActive || section.children.length === 0
                ? null
                : section.children.map((child) => (
                    <NavRow
                      key={child.to}
                      workspace={child}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      collapsed={collapsed}
                      nested
                    />
                  ))}
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
          </header>

          <main className="mx-auto w-full max-w-[84rem] flex-1 px-5 py-6 md:px-8 md:py-8">
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
