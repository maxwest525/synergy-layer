import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { buildYourPages, type YourPagesView } from "@/lib/your-pages";
import { getYourPagesExtras } from "@/lib/your-pages.functions";
import { getGettingFoundExtras } from "@/lib/getting-found.functions";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { useCommandCenter } from "./command-center-facts";
import { GETTING_FOUND_QUERY_KEY } from "./getting-found-facts";

export const YOUR_PAGES_QUERY_KEY = ["your-pages-extras"] as const;

/** This page is the Pages category. Its queue is narrowed to that id. */
const CATEGORY_ID = "pages";

export type YourPagesQuery = {
  readonly view: YourPagesView | null;
  readonly isPending: boolean;
  readonly error: Error | null;
};

/**
 * Everything the "Your pages" page renders.
 *
 * Three reads, two of them shared. The Command center's facts carry the period
 * comparison and the queue; the coverage read is the same one the search page
 * uses, under the same query key, so it is served from cache and the constraint
 * diagnosis ordering these rows is byte-for-byte the one that orders the search
 * page. Two category pages disagreeing about what is holding the site back
 * would be worse than either of them being wrong alone.
 *
 * Only the page rows and the audit findings are read fresh, because only this
 * page shows them.
 */
export function useYourPages(): YourPagesQuery {
  const session = useOperatorSession();
  const commandCenter = useCommandCenter();
  const loadExtras = useServerFn(getYourPagesExtras);
  const loadCoverage = useServerFn(getGettingFoundExtras);

  const extras = useQuery({
    queryKey: YOUR_PAGES_QUERY_KEY,
    queryFn: () => loadExtras(),
    enabled: session.signedIn,
    retry: false,
    staleTime: 120_000,
  });

  const coverage = useQuery({
    // Deliberately the search page's key: this is the same read, and sharing it
    // is what stops the two pages diagnosing differently.
    queryKey: GETTING_FOUND_QUERY_KEY,
    queryFn: () => loadCoverage(),
    enabled: session.signedIn,
    retry: false,
    staleTime: 120_000,
  });

  const facts = commandCenter.facts;
  const error = commandCenter.error ?? extras.error ?? coverage.error;
  const isPending = commandCenter.isPending || extras.isPending || coverage.isPending;

  if (error || !facts || !extras.data || !coverage.data) {
    return { view: null, isPending, error };
  }

  return {
    view: buildYourPages({
      now: facts.now,
      property: extras.data.property,
      pages: extras.data.pages,
      findings: extras.data.findings,
      queueSources: facts.queueSources.filter((source) => source.categoryId === CATEGORY_ID),
      observedPages: extras.data.observedPages,
      failedPages: extras.data.failedPages,
      lastObservedAt: extras.data.lastObservedAt,
      fixesLive: extras.data.fixesLive,
      // No property selected means no snapshots at all, which the view model
      // already renders as a named absence rather than as a zero.
      comparison: facts.search ?? {
        status: "insufficient",
        availableDays: 0,
        requiredDays: 56,
        latestDate: null,
      },
      coverage: coverage.data.coverage,
      sessions: coverage.data.sessions,
    }),
    isPending,
    error: null,
  };
}
