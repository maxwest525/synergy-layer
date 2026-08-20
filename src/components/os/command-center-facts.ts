import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { buildCommandCenter, type CommandCenterView } from "@/lib/command-center";
import { getCommandCenterFacts } from "@/lib/command-center.functions";
import { useOperatorSession } from "@/hooks/use-operator-session";

/** The one query key the shell and the home page share, so both read one fetch. */
export const COMMAND_CENTER_QUERY_KEY = ["command-center-facts"] as const;

export type CommandCenterQuery = {
  readonly view: CommandCenterView | null;
  readonly isPending: boolean;
  readonly error: Error | null;
};

/**
 * Reads the Command center's facts once and derives the whole view from them.
 *
 * The shell's waiting counts and the home page's cards come from this same
 * query, so the badge beside a category can never disagree with the queue
 * behind it. While the read is in flight, or if it fails, `view` is null and
 * callers render an absence rather than a zero.
 */
export function useCommandCenter(): CommandCenterQuery {
  const session = useOperatorSession();
  const loadFacts = useServerFn(getCommandCenterFacts);

  const query = useQuery({
    queryKey: COMMAND_CENTER_QUERY_KEY,
    queryFn: () => loadFacts(),
    enabled: session.signedIn,
    retry: false,
    // The shell reads this on every route, and the read walks the stored page
    // audit, so it is the heaviest thing on a navigation. These are daily
    // snapshots and an approval queue, not a live feed; two minutes of
    // staleness costs the operator nothing and saves a round trip per hop.
    staleTime: 120_000,
  });

  return {
    view: query.data ? buildCommandCenter(query.data) : null,
    isPending: query.isPending,
    error: query.error,
  };
}
