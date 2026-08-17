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

type RouteLike = {
  children?: RouteLike[];
  options?: { getParentRoute?: () => RouteLike };
};

function repairParentLinks(route: RouteLike) {
  for (const child of route.children ?? []) {
    const options = child.options;
    if (options?.getParentRoute && options.getParentRoute() !== route) {
      options.getParentRoute = () => route;
    }
    repairParentLinks(child);
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

  // A route module can be re-evaluated on its own (dev code splitting fetches
  // `?tsr-split=` variants of a route file) without its importers rebuilding.
  // The generated tree then still holds the previous parent object while the
  // child's `getParentRoute()` closure resolves the fresh, uninitialised one,
  // so every child id collapses to "/" and the router throws
  // "Duplicate routes found with id: /". Re-pointing each child at the parent
  // it is actually attached to keeps id derivation correct.
  repairParentLinks(routeTree as unknown as RouteLike);



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
