import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The advertiser review moved into the Competitor ads workspace at /ads.
 * Old links, bookmarks, and inbox items keep working through this redirect.
 */
export const Route = createFileRoute("/ads/advertisers")({
  beforeLoad: () => {
    throw redirect({ to: "/ads", replace: true });
  },
});
