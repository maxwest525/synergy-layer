import { Link, useHydrated, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { categoryIcon } from "./category-icons";
import { useCommandCenter } from "./command-center-facts";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useOperatorSession } from "@/hooks/use-operator-session";
import {
  CATEGORIES,
  breadcrumbsForPath,
  categoryForPath,
  navEntries,
  type NavEntry,
} from "@/lib/categories";
import type { StatusLine } from "@/lib/command-center";
import type { NavTone } from "@/lib/suggestion-queue";
import { getWorkspaceAccessState } from "@/lib/operator-session-gate";
import { cn } from "@/lib/utils";

/**
 * The redesigned shell: a 52px icon rail, a 208px panel, and a top bar.
 *
 * The nav is capped at the Command center plus the categories plus settings,
 * and `categories.ts` is the only place that list lives, so a feature can be
 * added to the product without being added to the navigation.
 *
 * Waiting counts come from the same query the Command center reads, so the
 * badge beside a category and the queue behind it are always the same number.
 */

/** Nav badges run green / yellow / red, as the boards paint them. */
const TONE_TEXT: Record<NavTone, string> = {
  positive: "text-primary",
  warning: "text-warning",
  danger: "text-destructive",
};

const STATUS_DOT: Record<StatusLine["tone"], string> = {
  positive: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
};

function activeFor(pathname: string, entry: NavEntry): boolean {
  if (entry.kind === "home") return pathname === "/";
  if (entry.kind === "category") return categoryForPath(pathname)?.id === entry.category.id;
  return pathname.startsWith(entry.to);
}

function IconRail({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Sections"
      className="hidden w-[52px] shrink-0 flex-col items-center gap-1.5 border-r border-sidebar-border py-3 md:flex"
    >
      {navEntries().map((entry) => {
        const Icon = categoryIcon(entry.icon);
        const active = activeFor(pathname, entry);
        // `mt-auto` pins settings to the foot of the rail, as the boards show.
        return (
          <div key={entry.to} className={cn(entry.kind === "settings" && "mt-auto")}>
            <Link
              to={entry.to}
              title={entry.title}
              aria-label={entry.title}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[34px] w-[34px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
                active && "border border-primary/30 bg-accent text-primary",
              )}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" />
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

function WaitingBadge({ count, tone }: { count: number; tone: NavTone | null }) {
  if (count === 0 || tone === null) return null;
  return (
    <span className={cn("ml-auto text-xs font-bold tabular-nums", TONE_TEXT[tone])}>{count}</span>
  );
}

function NavPanel({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { view } = useCommandCenter();
  const current = categoryForPath(pathname);
  const heading = current ?? null;
  const HeadingIcon = categoryIcon(heading?.icon ?? "grid");

  const waitingFor = (id: string) => view?.categories.find((row) => row.category.id === id) ?? null;

  return (
    <div className="flex w-full flex-col gap-1 px-3 py-3.5">
      <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
        <HeadingIcon
          className="h-[15px] w-[15px] text-primary"
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <span className="text-[13px] font-bold text-foreground">{heading?.title ?? "Today"}</span>
      </div>

      <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">
        Start here
      </p>
      <Link
        to="/"
        onClick={onNavigate}
        aria-current={pathname === "/" ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground transition-colors hover:text-foreground",
          pathname === "/" &&
            "rounded-l-none border-l-2 border-primary bg-accent font-semibold text-primary",
        )}
      >
        {(() => {
          const Icon = categoryIcon("grid");
          return <Icon className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />;
        })()}
        Command center
      </Link>

      <p className="px-2.5 pb-0.5 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">
        {current ? "Other categories" : "Categories"}
      </p>
      {CATEGORIES.filter((category) => category.id !== current?.id).map((category) => {
        const Icon = categoryIcon(category.icon);
        const waiting = waitingFor(category.id);
        return (
          <Link
            key={category.id}
            to={category.to}
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground transition-colors hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
            {category.title}
            <WaitingBadge count={waiting?.waiting ?? 0} tone={waiting?.tone ?? null} />
          </Link>
        );
      })}
    </div>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  const { view } = useCommandCenter();
  // Null until the read lands, so the crumb shows no domain rather than a guess.
  const crumbs = breadcrumbsForPath(pathname, view?.property ?? null);
  return (
    <header className="flex items-center justify-between gap-4 border-b border-sidebar-border px-5 py-3">
      <div className="flex min-w-0 items-center gap-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-[19px] w-[19px] items-center justify-center rounded-[4px] border border-primary"
          />
          <span className="text-sm font-bold text-foreground">Marky</span>
        </Link>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
          {crumbs.map((crumb, index) => (
            <span key={crumb.label} className="flex min-w-0 items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-subtle">
                  ›
                </span>
              ) : null}
              <span
                className={cn(
                  "truncate",
                  index === crumbs.length - 1
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>
      </div>

      {/*
        The board puts "Search or ask Marky ⌘K" here, but the composer is
        phase-gated last and no ⌘K handler is bound yet. Chrome that advertises
        a shortcut which does nothing is worse than chrome that waits, so the
        slot holds its shape and says plainly that it is not ready. The wording
        and the shortcut arrive with the composer.
      */}
      <div
        aria-hidden="true"
        className="hidden w-[300px] items-center gap-2.5 rounded-full border border-input bg-secondary px-3.5 py-2 lg:flex"
      >
        <Search className="h-3.5 w-3.5 text-subtle" strokeWidth={1.6} />
        <span className="flex-1 text-[13px] text-subtle">Search arrives with Ask Marky</span>
      </div>

      {/* Nothing is claimed here until the read lands. */}
      {view ? (
        <span className="flex shrink-0 items-center gap-2 text-xs text-sidebar-foreground">
          <span
            aria-hidden="true"
            className={cn("h-[7px] w-[7px] rounded-full", STATUS_DOT[view.statusLine.tone])}
          />
          {view.statusLine.text}
        </span>
      ) : null}
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = useOperatorSession();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const [menuOpen, setMenuOpen] = useState(false);

  const onAuthRoute = pathname.startsWith("/auth");
  const accessState = getWorkspaceAccessState({
    ready: session.ready,
    signedIn: session.signedIn,
    onAuthRoute,
  });

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

  if (onAuthRoute) return <>{children}</>;

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar pathname={pathname} />

      <div className="flex min-h-0 flex-1">
        <IconRail pathname={pathname} />

        <aside
          aria-label="Section navigation"
          className="hidden w-[208px] shrink-0 border-r border-sidebar-border md:block"
        >
          <NavPanel pathname={pathname} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-sidebar-border px-4 py-2 md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                aria-label="Open navigation"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
                Menu
              </SheetTrigger>
              <SheetContent side="left" className="w-[260px] p-0">
                <NavPanel pathname={pathname} onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>

          <main className="min-w-0 flex-1 px-5 py-5 md:px-6 md:py-6">
            {accessState === "ready" ? (
              children
            ) : (
              <div className="rounded-xl border border-border px-4 py-6" role="status">
                <p className="text-sm text-muted-foreground">
                  {/* Before hydration the browser session is unknown, so the
                      server and the first client render must say the same thing. */}
                  {!hydrated || accessState === "loading"
                    ? "Checking operator session…"
                    : "Taking you to sign in…"}
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
