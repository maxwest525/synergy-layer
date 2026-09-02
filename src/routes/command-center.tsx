import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The second "Command center". This route used to render the legacy overview:
 * eight count tiles, spend, capability and run lists, all of which showed a
 * zero on a first run or a failed read, while the page at "/" states an
 * absence as an absence. Two pages with one name, and the navigation linked
 * only one of them (NAV-1 and STATE-1 in the 2026-09-02 review). Everything
 * the old page linked to lives under the categories; the counts it showed
 * are on the pages that own them. An old bookmark lands on the one page.
 */
export const Route = createFileRoute("/command-center")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
