import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  BrainCircuit,
  CalendarClock,
  Gauge,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Plug,
  Search,
  Route as RouteIcon,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";

import { TenantSwitcher } from "./tenant-switcher";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { cn } from "@/lib/utils";

const workspaces = [
  { to: "/", label: "Action Center", icon: Inbox, hint: "Decide and execute" },
  { to: "/command-center", label: "Command Center", icon: LayoutDashboard, hint: "System state" },
  { to: "/assets", label: "Assets", icon: Boxes, hint: "Everything we own" },
  { to: "/search", label: "Search", icon: Search, hint: "What Google observed" },
  { to: "/seo-runs", label: "SEO Runs", icon: RouteIcon, hint: "Governed page changes" },
  { to: "/measurement", label: "Measurement", icon: Gauge, hint: "Page speed and analytics" },
  {
    to: "/essentials",
    label: "Essentials",
    icon: ListChecks,
    hint: "What is covered and what is missing",
  },
  { to: "/capabilities", label: "Capabilities", icon: Plug, hint: "What the OS can do" },
  { to: "/knowledge", label: "Knowledge", icon: BrainCircuit, hint: "What the OS knows" },
  { to: "/agents", label: "Agents", icon: Activity, hint: "Who does the work" },
  { to: "/workflows", label: "Workflows", icon: Workflow, hint: "How work runs" },
  { to: "/recommendations", label: "Recommendations", icon: Lightbulb, hint: "What to do next" },
  { to: "/scheduler", label: "Scheduler", icon: CalendarClock, hint: "When work runs" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = useOperatorSession();
  const onAuthRoute = pathname.startsWith("/auth");

  return (
    <div className="relative min-h-screen w-full bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_15%_-10%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_70%)]"
      />
      <div className="relative flex min-h-screen w-full">
        <nav
          aria-label="Workspaces"
          className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/70 px-3 py-5 backdrop-blur-xl lg:flex"
        >
          <Link to="/" className="mb-6 flex items-center gap-2 px-3">
            <span
              aria-hidden
              className="size-2 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]"
            />
            <span className="text-sm font-semibold tracking-tight text-foreground">AOOS</span>
            <span className="text-xs text-muted-foreground">Marketing OS</span>
          </Link>

          <TenantSwitcher />

          <ul className="flex flex-1 flex-col gap-0.5">
            {workspaces.map((workspace) => {
              const active =
                workspace.to === "/" ? pathname === "/" : pathname.startsWith(workspace.to);
              return (
                <li key={workspace.to}>
                  <Link
                    to={workspace.to}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <workspace.icon
                      aria-hidden
                      className={cn("size-4", active ? "text-primary" : "text-muted-foreground")}
                    />
                    <span className="flex-1 font-medium">{workspace.label}</span>
                    {active ? (
                      <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link
            to="/auth"
            className="mt-4 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            {session.signedIn ? (session.email ?? "Operator") : "Operator sign in"}
          </Link>
          <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">
            Every module registers itself. Nothing here is hardcoded per integration.
          </p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur lg:hidden">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.to}
                to={workspace.to}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-primary" }}
              >
                {workspace.label}
              </Link>
            ))}
          </div>

          {session.ready && !session.signedIn && !onAuthRoute ? (
            <div className="mx-auto w-full max-w-6xl px-5 pt-6 md:px-8">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  You are signed out, so every workspace reads as empty.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Operational state, evidence, and spend are hidden until an operator signs in.
                  These zeros are an access state, not the state of the system.
                </p>
                <Link
                  to="/auth"
                  className="mt-3 inline-flex items-center rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Sign in as operator
                </Link>
              </div>
            </div>
          ) : null}

          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
