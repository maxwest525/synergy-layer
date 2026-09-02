import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId } from "react";
import { toast } from "sonner";

import { COMMAND_CENTER_QUERY_KEY } from "./command-center-facts";
import { fixTargetForSiteCheck } from "@/lib/audit-fixes";
import { proposeAuditFix } from "@/lib/audit-proposals.functions";
import { actionFor } from "@/lib/command-center";
import { rejectChangeRequest } from "@/lib/change-requests.functions";
import { setRecommendationQueueState } from "@/lib/os-admin.functions";
import { proposeFixFromFinding } from "@/lib/search-findings.functions";
import { ignoreAuditFinding, restoreAuditFinding } from "@/lib/suggestion-suppressions.functions";
import type { QueueItem, UrgencyTone } from "@/lib/suggestion-queue";
import { verbsFor, type SuggestionVerb } from "@/lib/suggestion-verbs";
import { regeneratePageMetadataProposal } from "@/lib/page-metadata-proposals.functions";
import { regeneratePageWordingProposal } from "@/lib/page-wording-proposals.functions";
import { cn } from "@/lib/utils";

/**
 * One suggestion, on every category page.
 *
 * The three pages held three copies of this row, each offering a single link
 * to somewhere else. The queue already worked out which verbs are legal for a
 * row; this card is where the operator finally gets them. A verb the queue
 * calls illegal is not rendered at all — a disabled control would tell the
 * operator the action exists and they are not allowed it, which is not what is
 * true. What is true is that there is nowhere for it to go yet.
 *
 * Nothing here approves anything. Approval lives on /changes/$id and stays
 * there; setting aside and putting back run nothing and cost nothing.
 */

const URGENCY_TONE: Record<UrgencyTone, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

const LINK =
  "shrink-0 rounded-[10px] border border-input bg-secondary px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-border";

const VERB =
  "shrink-0 rounded-[10px] border border-input px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground";

export function SuggestionCard({ item }: { item: QueueItem }) {
  const action = actionFor(item);
  const verbs = verbsFor(item);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setQueueState = useServerFn(setRecommendationQueueState);
  const rejectChange = useServerFn(rejectChangeRequest);
  const redraft = useServerFn(regeneratePageWordingProposal);
  const redraftMetadata = useServerFn(regeneratePageMetadataProposal);
  const ignoreAudit = useServerFn(ignoreAuditFinding);
  const restoreAudit = useServerFn(restoreAuditFinding);
  const draftFix = useServerFn(proposeFixFromFinding);
  const draftAuditFix = useServerFn(proposeAuditFix);
  const describedBy = useId();

  const run = useMutation({
    mutationFn: async (verb: SuggestionVerb) => {
      if (verb.id === "draft") {
        // An audit finding is not a recommendation row, so it cannot be drafted
        // by id — it is drafted from its check and the page it names. Both
        // lanes file a governed proposal and return the same shape.
        if (item.kind === "audit") {
          // A site finding names no page on purpose: its fix is the sitewide
          // crawl directives, so it drafts against the site scope.
          if (item.rule && fixTargetForSiteCheck(item.rule)) {
            return draftAuditFix({
              data: { scope: "site", check: item.rule, idempotencyKey: crypto.randomUUID() },
            });
          }
          if (!item.targetUrl) {
            throw new Error(
              "This finding names no page yet, so there is nothing to draft against.",
            );
          }
          return draftAuditFix({
            data: {
              scope: "page",
              check: item.rule ?? undefined,
              targetUrl: item.targetUrl,
              idempotencyKey: crypto.randomUUID(),
            },
          });
        }
        return draftFix({
          data: { recommendationId: item.id, idempotencyKey: crypto.randomUUID() },
        });
      }
      if (item.kind === "audit") {
        const fingerprint = item.fingerprint ?? item.id;
        return verb.id === "ignore"
          ? ignoreAudit({ data: { fingerprint } })
          : restoreAudit({ data: { fingerprint } });
      }
      if (verb.id === "regenerate") {
        // Each lane redrafts through its own function; both land as an
        // immutable revision on the same draft.
        return item.proposalType === "page_metadata"
          ? redraftMetadata({ data: { id: item.id } })
          : redraft({ data: { id: item.id } });
      }
      if (item.kind === "change") return rejectChange({ data: { id: item.id, notes: null } });
      return setQueueState({ data: { id: item.id, verb: verb.id } });
    },
    onSuccess: async (_result, verb) => {
      if (verb.id === "draft") {
        const drafted = _result as { changeRequest: { id: string } };
        toast.success("Draft written. Read it before approving; nothing has changed on the site.");
        await navigate({ to: "/changes/$id", params: { id: drafted.changeRequest.id } });
        return;
      }
      toast.success(
        verb.id === "regenerate"
          ? "New wording drafted. Open the fix to read it before approving."
          : verb.id === "ignore"
            ? item.kind === "change"
              ? "Rejected. This proposal is closed for good."
              : "Set aside. You can put it back from the ignored list."
            : "Put back on your list.",
      );
      await queryClient.invalidateQueries({ queryKey: COMMAND_CENTER_QUERY_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-foreground">{item.title}</span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-subtle">
            <span className={URGENCY_TONE[item.tone]}>{item.urgencyLabel}</span>
            {item.targetUrl ? ` · ${item.targetUrl}` : null}
          </span>
        </span>
        {action.params ? (
          <Link to={action.to} params={action.params} className={LINK}>
            {action.label}
          </Link>
        ) : (
          <Link to={action.to} className={LINK}>
            {action.label}
          </Link>
        )}
      </div>
      {verbs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {verbs.map((verb) => (
            <span key={verb.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => run.mutate(verb)}
                disabled={run.isPending}
                aria-describedby={`${describedBy}-${verb.id}`}
                className={cn(VERB, verb.metered && "border-warning/50 text-warning")}
              >
                {run.isPending && run.variables?.id === verb.id ? "Working…" : verb.label}
              </button>
              <span
                id={`${describedBy}-${verb.id}`}
                className="text-[11px] leading-snug text-subtle"
              >
                {verb.consequence}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
