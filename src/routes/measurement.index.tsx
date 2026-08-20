import { createFileRoute } from "@tanstack/react-router";

import { SiteHealthPage } from "@/components/os/site-health-page";
import type { TabId } from "@/lib/site-health";
import { OperatorRouteError } from "@/components/os/route-error";

const TABS: readonly TabId[] = ["suggestions", "outcomes", "crawl", "history"];

export const Route = createFileRoute("/measurement/")({
  /**
   * The tab lives in the URL so a link can land on one. An untrusted value
   * falls back rather than throwing: a bad query string is not worth an error
   * page.
   */
  validateSearch: (search: Record<string, unknown>): { tab?: TabId } => {
    const tab = search["tab"];
    return TABS.includes(tab as TabId) ? { tab: tab as TabId } : {};
  },
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produced an empty tree the client immediately replaced.
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Site health · Marky" },
      {
        name: "description",
        content:
          "Whether your site loads fast, whether Google can read it, and whether the fixes you approved actually worked.",
      },
    ],
  }),
  component: SiteHealthRoute,
});

function SiteHealthRoute() {
  const { tab } = Route.useSearch();
  return tab === undefined ? <SiteHealthPage /> : <SiteHealthPage initialTab={tab} />;
}
