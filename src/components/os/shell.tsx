import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
  Radar,
  ListChecks,
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
      { to: "/", label: "Action Center", icon: Inbox, hint: "Decide and execute" },
      { to: "/command-center", label: "Command Center", icon: LayoutDashboard, hint: "System state" },
      { to: "/recommendations", label: "Recommendations", icon: Lightbulb, hint: "What to do next" },
    ],
  },
  {
    title: "Evidence",
    items: [
      { to: "/search", label: "Search", icon: Search, hint: "What Google observed" },
      { to: "/measurement", label: "Measurement", icon: Gauge, hint: "Page speed and analytics" },
      { to: "/assets", label: "Assets", icon: Boxes, hint: "Everything we own" },
      {
        to: "/essentials",
        label: "Essentials",
        icon: ListChecks,
        hint: "Covered and missing",
      },
    ],
  },
  {
    title: "Run work",
    items: [
      { to: "/openseo", label: "OpenSEO", icon: Radar, hint: "Live SEO tools" },
      { to: "/seo-runs", label: "SEO Runs", icon: RouteIcon, hint: "Governed page changes" },
      { to: "/openai-ads", label: "OpenAI Ads", icon: Megaphone, hint: "Pixel instrumentation" },
      { to: "/workflows", label: "Workflows", icon: Workflow, hint: "How work runs" },
      { to: "/scheduler", label: "Scheduler", icon: CalendarClock, hint: "When work runs" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/capabilities", label: "Capabilities", icon: Plug, hint: "What the OS can do" },
      { to: "/knowledge", label: "Knowledge", icon: BrainCircuit, hint: "What the OS knows" },
      { to: "/agents", label: "Agents", icon: Activity, hint: "Who does the work" },
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
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((workspace) => {
              const active = isActive(pathname, workspace.to);
              return (
                <li key={workspace.to}>
                  <Link
                    to={workspace.to}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <workspace.icon
                      aria-hidden
                      className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{workspace.label}</span>
                      <span className="block truncate text-xs text-muted-foreground/80">
                        {workspace.hint}
                      </span>
                    </span>
                    {active ? (
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
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
  const onAuthRoute = pathname.startsWith("/auth");
  const accessState = getWorkspaceAccessState({
    ready: session.ready,
    signedIn: session.signedIn,
    onAuthRoute,
  });

  // A route change while the drawer is open should leave the new page visible.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const accountLabel = session.signedIn ? (session.email ?? "Operator") : "Operator sign in";

  return (
    <div className="relative min-h-screen w-full bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_15%_-10%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_70%)]"
      />
      <div className="relative flex min-h-screen w-full">
        <nav
          aria-label="Workspaces"
          className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-sidebar/70 px-3 py-5 backdrop-blur-xl lg:flex"
        >
          <Link to="/" className="mb-6 px-3">
            <BrandMark />
          </Link>

          <TenantSwitcher session={session} />

          <div className="flex-1">
            <NavList pathname={pathname} />
          </div>

          <Link
            to="/auth"
            className="mt-6 truncate rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            {accountLabel}
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
                className="w-[19rem] overflow-y-auto border-border/60 bg-sidebar px-4 py-6"
              >
                <div className="mb-5">
                  <BrandMark />
                </div>
                <TenantSwitcher session={session} />
                <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="mt-6 block truncate rounded-xl border border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
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
            {accessState === "loading" ? (
              <div className="rounded-2xl border border-border/60 px-4 py-6" role="status">
                <p className="text-sm text-muted-foreground">Checking operator session…</p>
              </div>
            ) : accessState === "signed-out" ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4">
                <p className="text-sm font-medium text-foreground">Operator sign-in required</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Operational state, evidence, and spend remain hidden until an operator signs in.
                </p>
                <Link
                  to="/auth"
                  className="mt-3 inline-flex items-center rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Sign in as operator
                </Link>
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
