import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ScanSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyNote, GlassCard, StatePill, formatWhen } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { getPageAudit, runPageWordingAudit } from "@/lib/page-audit.functions";
import type { CheckFinding, Severity } from "@/lib/page-checks";
import { generateTitleH1Proposal } from "@/lib/title-h1-proposals.functions";

const TONE: Record<Severity, "danger" | "warning" | "neutral"> = {
  critical: "danger",
  warning: "warning",
  advice: "neutral",
};

/**
 * Site wide on page audit over the stored page reads: wording, search
 * description, indexing directives, structured data, images, content depth and
 * internal linking. Every finding names the exact pages and the next step.
 */
export function PageAuditPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const read = useServerFn(getPageAudit);
  const run = useServerFn(runPageWordingAudit);
  const propose = useServerFn(generateTitleH1Proposal);
  const [openCheck, setOpenCheck] = useState<string | null>(null);

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
  const findings: CheckFinding[] = data?.findings ?? [];

  return (
    <GlassCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Page audit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {audit.isPending ? "Reading the stored page audit..." : data?.instruction}
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
          {runAudit.isPending ? "Reading pages" : "Audit pages"}
        </Button>
      </div>

      {audit.isError ? (
        <p className="text-sm text-destructive">
          The page audit could not be loaded. {audit.error.message}
        </p>
      ) : findings.length === 0 ? (
        <EmptyNote>
          No page defects are stored. Run the audit to check every page Google reported for wording,
          descriptions, indexing, structured data, images and content depth.
        </EmptyNote>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding) => {
            const open = openCheck === finding.check;
            return (
              <li key={finding.check} className="rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatePill tone={TONE[finding.severity]} label={finding.label} />
                    <span className="text-sm text-foreground">{finding.instruction}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenCheck(open ? null : finding.check)}
                  >
                    {open ? "Hide pages" : `View ${finding.pages.length} pages`}
                  </Button>
                </div>
                {open ? (
                  <ul className="mt-3 space-y-2">
                    {finding.pages.map((page) => (
                      <li
                        key={page.url}
                        className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2"
                      >
                        <div className="min-w-0">
                          <p className="break-all text-xs text-foreground">{page.url}</p>
                          <p className="text-xs text-muted-foreground">{page.detail}</p>
                        </div>
                        {finding.fixableByWordingProposal ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={proposeFix.isPending}
                            onClick={() => proposeFix.mutate(page.url)}
                          >
                            Propose a fix
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual fix for now</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Every finding comes from the rendered live page, not from a guess. Fixes go through the usual
        review queue in{" "}
        <Link to="/changes" className="text-primary hover:underline">
          page changes
        </Link>
        .
      </p>
    </GlassCard>
  );
}
