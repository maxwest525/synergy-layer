import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense } from "react";

import { NextBestActions } from "@/components/os/next-best-actions";
import { getTenantContext } from "@/lib/tenant.functions";

/**
 * The next-action guidance, mountable on a page that does not itself suspend.
 *
 * `NextBestActions` reads its facts with `useSuspenseQuery`, so it can only be
 * rendered under a boundary. `/essentials` gets one from the route; the Command
 * center resolves its own read with `isPending` and deliberately does not
 * suspend, so mounting the guidance there needs a boundary of its own rather
 * than a change to how the landing page loads.
 *
 * Why this exists at all: the guidance engine is 900 lines of rules that answer
 * "what should I do next", and it was mounted on exactly one page, filed under
 * Evidence in the navigation, with nothing linking to it from the screen an
 * operator actually opens. The Command center's own subtitle is "What needs you
 * first, and the fastest way to clear it" -- which is what these rules produce.
 */
export function NextActionsPanel() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-busy="true" className="text-[13px] text-muted-foreground">
          Working out what needs you first…
        </div>
      }
    >
      <NextActionsPanelInner />
    </Suspense>
  );
}

function NextActionsPanelInner() {
  const loadTenantContext = useServerFn(getTenantContext);
  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });

  return <NextBestActions tenantId={tenant.data.activeTenantId} />;
}
