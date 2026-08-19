import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { EmptyNote, GlassCard, StatePill, formatWhen } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { getPageAudit, runPageWordingAudit } from "@/lib/page-audit.functions";
import { generateTitleH1Proposal } from "@/lib/title-h1-proposals.functions";

/**
 * Site wide duplicate headline and tab title detection over the stored page
 * wording audit. Every row carries the fix action for the exact page.
 */
export function DuplicateWordingPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const read = useServerFn(getPageAudit);
  const run = useServerFn(runPageWordingAudit);
  const propose = useServerFn(generateTitleH1Proposal);

  const audit = useQuery({
    queryKey: ["page-audit"],
    queryFn: () => read({ data: undefined }),
  });

  const runAudit = useMutation({
    mutationFn: () => run({ data: undefined }),
    onSuccess: (result) => {
      queryClient.setQueryData(["page-audit"], result);
      toast.success(
        `Read ${result.observedPages} pages. ${result.duplicates.length} wording collisions found.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const proposeFix = useMutation({
    mutationFn: (targetUrl: string) =>
      propose({ data: { targetUrl, idempotencyKey: crypto.randomUUID(), mode: "gemini" } }),
    onSuccess: (result) => {
      toast.success("Edit proposed. Review it before anything is published.");
      void navigate({ to: "/changes/$id", params: { id: result.changeRequest.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = audit.data;
  const duplicates = data?.duplicates ?? [];

  return (
    <GlassCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Repeated wording</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {audit.isPending ? "Reading the stored page wording audit..." : data?.instruction}
          </p>
          {data?.lastObservedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last read {formatWhen(data.lastObservedAt)} · {data.observedPages} pages read
              {data.failedPages > 0 ? ` · ${data.failedPages} could not be read` : ""}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={runAudit.isPending}
          onClick={() => runAudit.mutate()}
        >
          <ScanSearch className="mr-2 h-4 w-4" />
          {runAudit.isPending ? "Reading pages" : "Audit page wording"}
        </Button>
      </div>

      {audit.isError ? (
        <p className="text-sm text-destructive">
          The wording audit could not be loaded. {audit.error.message}
        </p>
      ) : duplicates.length === 0 ? (
        <EmptyNote>
          No repeated headlines or tab titles are stored. Run the audit to read every page Google
          reported.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {duplicates.map((group) => (
            <li
              key={`${group.field}:${group.value}`}
              className="rounded-xl border border-border/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatePill
                  tone="warning"
                  label={group.field === "h1" ? "same headline" : "same tab title"}
                />
                <span className="text-sm font-medium text-foreground">{group.value}</span>
                <span className="text-xs text-muted-foreground">
                  used on {group.urls.length} pages
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {group.urls.map((url) => (
                  <li key={url} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all text-xs text-muted-foreground">{url}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={proposeFix.isPending}
                      onClick={() => proposeFix.mutate(url)}
                    >
                      Make it unique
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Wording comes from the rendered live page, not from a guess. Fixes go through the usual
        review queue in{" "}
        <Link to="/changes" className="text-primary hover:underline">
          page changes
        </Link>
        .
      </p>
    </GlassCard>
  );
}
