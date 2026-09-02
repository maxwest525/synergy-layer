import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoonStar } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/format-when";
import { getSiteWatch, runSiteWatchNow } from "@/lib/site-watch.functions";

/**
 * The nightly live-site read (CODE-87). Every sitemap address is fetched by
 * AOOS itself and compared with the night before; what changed is filed under
 * Site health. The read is free, so the operator may take one now, and one
 * stored night is what lets the cadence above be turned on.
 */
export function SiteWatchPanel() {
  const queryClient = useQueryClient();
  const read = useServerFn(getSiteWatch);
  const run = useServerFn(runSiteWatchNow);

  const watch = useQuery({ queryKey: ["site-watch"], queryFn: () => read({ data: undefined }) });

  const readNow = useMutation({
    mutationFn: () => run({ data: undefined }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["site-watch"] });
      void queryClient.invalidateQueries({ queryKey: ["observation-cadences"] });
      toast.success(
        result.comparedWith
          ? `Read ${result.pagesRead} pages and compared them with ${result.comparedWith}: ${result.findingsFiled} new finding(s).`
          : `Read ${result.pagesRead} pages. The first comparison happens on the next read.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = watch.data;
  const summary = (() => {
    if (watch.isPending) return "Reading what the nightly read has stored...";
    if (!data) return null;
    if (data.lastObservedOn === null) {
      return "Not read yet. Take one read, then the nightly cadence can be turned on above.";
    }
    const parts = [
      `Last read ${formatWhen(data.lastObservedAt)}`,
      `${data.pagesRead} pages read`,
      ...(data.pagesUnanswered > 0 ? [`${data.pagesUnanswered} went unanswered`] : []),
      `${data.nightsStored} ${data.nightsStored === 1 ? "night" : "nights"} stored`,
    ];
    return parts.join(" · ");
  })();

  return (
    <GlassCard className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Live site, every night</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every address in the sitemap is fetched by AOOS itself and compared with the night
            before. A page that stops answering, goes noindex or changes its canonical is filed
            under Site health the next morning. Free: it reads your own site.
          </p>
          {summary ? <p className="mt-1 text-xs text-muted-foreground">{summary}</p> : null}
          {data?.nightsStored === 1 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              One night stored, so there is nothing to compare yet; the comparison starts with the
              next read.
            </p>
          ) : null}
          {data?.lastRun?.status === "failed" && data.lastRun.error ? (
            <p className="mt-1 text-xs text-destructive">
              The last read failed {formatWhen(data.lastRun.startedAt)}: {data.lastRun.error}
            </p>
          ) : null}
          {data && data.property === null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No Search Console property is selected, so there is no site to read.
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={readNow.isPending || data?.property === null}
          onClick={() => readNow.mutate()}
        >
          <MoonStar className="mr-2 h-4 w-4" />
          {readNow.isPending ? "Reading the site" : "Read the live site now"}
        </Button>
      </div>
    </GlassCard>
  );
}
