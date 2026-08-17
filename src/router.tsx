import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RoutePending } from "./components/os/route-pending";
import {
  installVitePreloadRecovery,
  requestRouterRuntimeRecovery,
} from "./lib/vite-runtime-recovery";
import { routeTree } from "./routeTree.gen";

type RecoveryWindow = Window & { __aoosVitePreloadRecoveryInstalled?: boolean };

function getBrowserRecoveryRuntime() {
  if (typeof window === "undefined") return null;
  return {
    storage: window.sessionStorage,
    reload: () => window.location.reload(),
    now: () => Date.now(),
  };
}

const recoveryRuntime = getBrowserRecoveryRuntime();
if (recoveryRuntime) {
  const recoveryWindow = window as RecoveryWindow;
  if (!recoveryWindow.__aoosVitePreloadRecoveryInstalled) {
    installVitePreloadRecovery({ target: window, ...recoveryRuntime });
    recoveryWindow.__aoosVitePreloadRecoveryInstalled = true;
  }
}

export const getRouter = () => {
  // Workspace reads are operator scoped and change slowly. A short stale window
  // makes a second visit to a workspace render straight from cache instead of
  // paying another server round trip.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  if (typeof window === "undefined") {
    const problems: string[] = [];
    const walk = (r: any, path: string) => {
      const kids = (r.children ?? []) as any[];
      const seen = new Map<string, number>();
      for (const c of kids) {
        const k = String(c.options?.id ?? c.options?.path ?? "?");
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      for (const [k, n] of seen) if (n > 1) problems.push(`${path} -> ${k} x${n}`);
      for (const c of kids) walk(c, `${path}/${String(c.options?.path ?? c.options?.id ?? "?")}`);
    };
    walk(routeTree as any, "");
    console.error("ROUTE_WALK", (routeTree as any).children?.length, JSON.stringify(problems));
  }

  let router;
  try {
    router = createRouter({
      routeTree,
      context: { queryClient },
      Wrap: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
      scrollRestoration: true,
      defaultPreload: "intent",
      defaultPreloadDelay: 50,
      defaultPreloadStaleTime: 0,
      defaultPendingMs: 150,
      defaultPendingMinMs: 200,
      defaultPendingComponent: RoutePending,
    });
  } catch (error) {
    if (recoveryRuntime) requestRouterRuntimeRecovery(error, recoveryRuntime);
    throw error;
  }

  return router;
};
