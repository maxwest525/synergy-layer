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
    const ids = new Map<string, string[]>();
    let i = 0;
    const walk = (r: any, parentLabel: string) => {
      try {
        r.init({ originalIndex: i++ });
      } catch (e) {
        console.error("INIT_FAIL", parentLabel, String(e));
        return;
      }
      const list = ids.get(String(r.id)) ?? [];
      list.push(parentLabel + "|" + String(r.options?.path ?? r.options?.id ?? "?"));
      ids.set(String(r.id), list);
      for (const c of (r.children ?? [])) walk(c, String(r.id));
    };
    walk(routeTree as any, "root");
    const dupes = [...ids.entries()].filter(([, v]) => v.length > 1);
    if (dupes.length) console.error("ID_DUPES", JSON.stringify(dupes));
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
