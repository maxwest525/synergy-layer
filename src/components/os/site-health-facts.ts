import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { buildSiteHealth, type SiteHealthView } from "@/lib/site-health";
import { getSiteHealthExtras } from "@/lib/site-health.functions";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { useCommandCenter } from "./command-center-facts";

export const SITE_HEALTH_QUERY_KEY = ["site-health-extras"] as const;

/** This page is the Site health category. Its queue is narrowed to that id. */
const CATEGORY_ID = "health";

export type SiteHealthQuery = {
  readonly view: SiteHealthView | null;
  readonly isPending: boolean;
  readonly error: Error | null;
};

/**
 * Everything the "Site health" page renders.
 *
 * The queue comes from the Command center's cached facts, so the count beside
 * this category in the nav and the list behind it are one derivation. Only the
 * crawl evidence, the stored measurement readings and the speed scores are read
 * fresh, because only this page shows them.
 */
export function useSiteHealth(): SiteHealthQuery {
  const session = useOperatorSession();
  const commandCenter = useCommandCenter();
  const loadExtras = useServerFn(getSiteHealthExtras);

  const extras = useQuery({
    queryKey: SITE_HEALTH_QUERY_KEY,
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
    view: buildSiteHealth({
      now: facts.now,
      property: extras.data.property,
      siteFindings: extras.data.siteFindings,
      siteObservedAt: extras.data.siteObservedAt,
      outcomes: extras.data.outcomes,
      speed: extras.data.speed,
      queueSources: facts.queueSources.filter((source) => source.categoryId === CATEGORY_ID),
    }),
    isPending,
    error: null,
  };
}
