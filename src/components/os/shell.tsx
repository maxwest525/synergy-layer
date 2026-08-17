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
          <p className="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            {group.title}
          </p>
          {/* A single hairline rail runs behind the group so its items read as
              one connected path instead of unrelated rows. */}
          <ul className="relative flex flex-col gap-1 border-l border-border/40 pl-2">
            {group.items.map((workspace) => {
              const active = isActive(pathname, workspace.to);
              return (
                <li key={workspace.to} className="relative">
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute -left-2 top-1/2 h-6 w-px -translate-y-1/2 bg-primary shadow-[0_0_10px_var(--color-primary)]"
                    />
                  ) : null}
                  <Link
                    to={workspace.to}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                    )}
                  >
                    <workspace.icon
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground/80",
                      )}
                    />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-medium">{workspace.label}</span>
                      <span className="block truncate text-xs text-muted-foreground/70">
                        {workspace.hint}
                      </span>
                    </span>
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
          className="scrollbar-none sticky top-0 hidden h-screen w-80 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-sidebar/70 px-4 py-5 backdrop-blur-xl lg:flex"
        >
          <Link to="/" className="mb-5 block px-2.5">
            <BrandMark />
          </Link>

          <div className="pb-4">
            <TenantSwitcher session={session} />
          </div>

          <div className="flex-1 border-t border-border/50 pt-4">
            <NavList pathname={pathname} />
          </div>

          <Link
            to="/auth"
            className="mt-4 block truncate border-t border-border/50 px-2.5 pt-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                className="flex w-[19rem] flex-col overflow-y-auto border-border/60 bg-sidebar px-4 py-6"
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
                  className="mt-4 block truncate border-t border-border/50 px-2.5 pt-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
