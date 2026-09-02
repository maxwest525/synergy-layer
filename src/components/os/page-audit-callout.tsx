import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/os/primitives";
import { formatWhen } from "@/lib/format-when";
import { Button } from "@/components/ui/button";
import { getPageAudit, runPageWordingAudit } from "@/lib/page-audit.functions";

/**
 * Surfaces the page audit where the operator actually looks for it. Most rule
 * findings are blind until the audit has read the site's pages at least once,
 * so the never-ran state is loud; after a first run it collapses to one quiet
 * line that keeps the run action findable from this page.
 */
export function PageAuditCallout() {
  const queryClient = useQueryClient();
  const read = useServerFn(getPageAudit);
  const run = useServerFn(runPageWordingAudit);

  const audit = useQuery({
    queryKey: ["page-audit"],
    queryFn: () => read({ data: undefined }),
  });

  const runAudit = useMutation({
    mutationFn: () => run({ data: undefined }),
    onSuccess: (result) => {
      queryClient.setQueryData(["page-audit"], result);
      toast.success(
        `Read ${result.observedPages} pages. ${result.findings.length} kinds of defect found.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = audit.data;
  if (!data) return null;

  const neverRan = data.lastObservedAt === null;
  const runButton = (
    <Button
      variant={neverRan ? "default" : "outline"}
      size="sm"
      disabled={runAudit.isPending}
      onClick={() => runAudit.mutate()}
    >
      <ScanSearch className="mr-2 h-4 w-4" />
      {runAudit.isPending ? "Reading pages" : "Run page audit"}
    </Button>
  );

  if (neverRan) {
    return (
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-warning/40 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            The page audit has never run for this site
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Until it reads your pages once, every page-level check (titles, descriptions, structured
            data, indexing directives) has nothing to look at. One run reads up to 100 pages through
            Firecrawl.
          </p>
        </div>
        {runButton}
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        Page audit last ran {formatWhen(data.lastObservedAt)} · {data.observedPages} pages read ·{" "}
        <Link to="/pages" className="text-primary hover:underline">
          findings on Your pages
        </Link>
      </p>
      {runButton}
    </div>
  );
}
