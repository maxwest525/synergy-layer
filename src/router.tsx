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
type RouteNode = {
  children?: RouteNode[];
  options: { getParentRoute?: () => RouteNode };
};

/**
 * Vite can retain child route instances while replacing their parent module.
 * Their generated getParentRoute closures then point at the obsolete graph,
 * so initialization sees several children as root-level "/" routes. Relink
 * each generated child to the parent in the current tree before Router mutates
 * route ids. This is a no-op in clean production graphs and makes dev HMR safe.
 */
function repairParentLinks(parent: RouteNode): void {
  for (const child of parent.children ?? []) {
    child.options.getParentRoute = () => parent;
    repairParentLinks(child);
  }
}

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

  let router;
  try {
    repairParentLinks(routeTree as unknown as RouteNode);
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
