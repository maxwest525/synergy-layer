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
  Route as RouteIcon,
  Workflow,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { TenantSwitcher } from "./tenant-switcher";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { getWorkspaceAccessState } from "@/lib/operator-session-gate";
import { cn } from "@/lib/utils";

type Workspace = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hint: string;
};

type WorkspaceGroup = { title: string; items: readonly Workspace[] };

/**
 * The sidebar used to be a flat list of fifteen destinations, which read as a
 * pile rather than as a path. Grouping states the order of work: decide, then
 * look at evidence, then run something, then inspect the system itself.
 */
const navGroups: readonly WorkspaceGroup[] = [
  {
    title: "Decide",
    items: [
      { to: "/", label: "Action center", icon: Inbox, hint: "Decisions waiting on you" },
      {
        to: "/command-center",
        label: "Overview",
        icon: LayoutDashboard,
        hint: "How everything stands",
      },
      {
        to: "/recommendations",
        label: "Observations",
        icon: Lightbulb,
        hint: "Things the system noticed",
      },
      {
        to: "/changes",
        label: "Page changes",
        icon: FileDiff,
        hint: "Edits proposed to the site",
      },
    ],
  },
  {
    title: "Evidence",
    items: [
      { to: "/search", label: "Search results", icon: Search, hint: "What Google reports" },
      { to: "/measurement", label: "Site health", icon: Gauge, hint: "Speed and traffic" },
      { to: "/assets", label: "Assets", icon: Boxes, hint: "Everything we own" },
      { to: "/keywords", label: "Keywords", icon: Tags, hint: "Terms worth winning" },
      { to: "/competitors", label: "Competitors", icon: Swords, hint: "Who we rank against" },
      {
        to: "/ads",
        label: "Competitor ads",
        icon: KeyRound,
        hint: "Ads they are running now",
      },
      { to: "/authority", label: "Trust gaps", icon: ShieldCheck, hint: "Missing proof on pages" },
      {
        to: "/essentials",
        label: "Marketing essentials",
        icon: ListChecks,
        hint: "Covered and missing",
      },
    ],
  },
  {
    title: "Run work",
    items: [
      { to: "/openseo", label: "OpenSEO", icon: Radar, hint: "Live SEO tools" },
      { to: "/seo-runs", label: "SEO runs", icon: RouteIcon, hint: "Governed page changes" },
      { to: "/openai-ads", label: "OpenAI Ads", icon: Megaphone, hint: "Pixel instrumentation" },
      { to: "/workflows", label: "Workflows", icon: Workflow, hint: "How work runs" },
      { to: "/scheduler", label: "Schedule", icon: CalendarClock, hint: "When work runs" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/capabilities", label: "Capabilities", icon: Plug, hint: "What the OS can do" },
      { to: "/knowledge", label: "Knowledge", icon: BrainCircuit, hint: "What the OS knows" },
      { to: "/agents", label: "Agents", icon: Activity, hint: "Who does the work" },
      { to: "/spend", label: "Data costs", icon: DollarSign, hint: "What data sources cost" },
      { to: "/operators", label: "People", icon: Users, hint: "Who has access" },
    ],
  },

] as const;

const allWorkspaces = navGroups.flatMap((group) => group.items);

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

function currentWorkspaceLabel(pathname: string): string {
  const match = [...allWorkspaces]
    .sort((a, b) => b.to.length - a.to.length)
    .find((workspace) => isActive(pathname, workspace.to));
  return match?.label ?? "AOOS";
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
      {navGroups.map((group, groupIndex) => (
        <section
          key={group.title}
          aria-label={group.title}
          className={cn(
            "py-4",
            groupIndex > 0 && "border-t border-border/50",
            groupIndex === 0 && "pt-0",
          )}
        >
          {collapsed ? null : (
            <p className="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foreground/75">
              {group.title}
            </p>
          )}
          {/* A single hairline rail runs behind the group so its items read as
              one connected path instead of unrelated rows. */}
          <ul
            className={cn(
              "relative flex flex-col gap-1",
              collapsed ? "items-center" : "border-l border-border/40 pl-2",
            )}
          >
            {group.items.map((workspace) => {
              const active = isActive(pathname, workspace.to);
              return (
                <li key={workspace.to} className="relative">
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
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-foreground/90",
                      )}
                    />
                    {collapsed ? null : (
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-medium">{workspace.label}</span>
                        <span className="block truncate text-xs text-foreground/70">
                          {workspace.hint}
                        </span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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

          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 md:px-8 md:py-8">
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
