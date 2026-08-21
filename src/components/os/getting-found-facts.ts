import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { buildGettingFound, type GettingFoundView } from "@/lib/getting-found";
import { getGettingFoundExtras } from "@/lib/getting-found.functions";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { useCommandCenter } from "./command-center-facts";

export const GETTING_FOUND_QUERY_KEY = ["getting-found-extras"] as const;

/** This page is the Search category. Its queue is narrowed to that id. */
const CATEGORY_ID = "search";

export type GettingFoundQuery = {
  readonly view: GettingFoundView | null;
  readonly isPending: boolean;
  readonly error: Error | null;
};

/**
 * Everything the "Getting found on Google" page renders.
 *
 * Two reads, deliberately: the Command center's facts, which the shell has
 * already fetched and cached, and one light read for what only this page shows.
 * Reusing the first is not just a saved round trip — it is what stops the tiles
 * here from disagreeing with the badge beside this category in the nav.
 *
 * The queue is narrowed to this category. Suggestions filed elsewhere stay
 * where the router put them rather than being duplicated onto every page.
 */
export function useGettingFound(): GettingFoundQuery {
  const session = useOperatorSession();
  const commandCenter = useCommandCenter();
  const loadExtras = useServerFn(getGettingFoundExtras);

  const extras = useQuery({
    queryKey: GETTING_FOUND_QUERY_KEY,
    queryFn: () => loadExtras(),
    enabled: session.signedIn,
    retry: false,
    staleTime: 120_000,
  });

  const facts = commandCenter.facts;
  const error = commandCenter.error ?? extras.error;
  const isPending = commandCenter.isPending || extras.isPending;

  if (error || !facts || !extras.data) {
    return { view: null, isPending, error };
  }

  return {
    view: buildGettingFound({
      now: facts.now,
      property: facts.property,
      // No property selected means no snapshots at all, which the view model
      // already renders as a named absence rather than as a zero.
      comparison: facts.search ?? {
        status: "insufficient",
        availableDays: 0,
        requiredDays: 56,
        latestDate: null,
      },
      latestDate: extras.data.latestDate,
      queries: extras.data.queries,
      pages: extras.data.pages,
      queueSources: facts.queueSources.filter((source) => source.categoryId === CATEGORY_ID),
      coverage: extras.data.coverage,
      sessions: extras.data.sessions,
      approvedKeywords: extras.data.approvedKeywords,
      backlinkSnapshots: extras.data.backlinkSnapshots,
    }),
    isPending,
    error: null,
  };
}
