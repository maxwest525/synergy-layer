import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, GitPullRequestArrow, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { EmptyNote, StatePill, formatWhen, toneForState } from "./primitives";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { PipelineStage, SuggestionItem } from "@/lib/suggestions.functions";
import { listSuggestionPipeline } from "@/lib/suggestions.functions";
import { cn } from "@/lib/utils";

const STAGES: readonly { key: PipelineStage; label: string }[] = [
  { key: "propose", label: "Propose" },
  { key: "approve", label: "Approve" },
  { key: "execute", label: "Execute" },
  { key: "measure", label: "Measure" },
] as const;

function StageTrack({ item }: { item: SuggestionItem }) {
  return (
    <ol className="mt-2 flex items-center gap-1" aria-label="Pipeline position">
      {STAGES.map((stage, index) => {
        const complete = item.done.includes(stage.key);
        const current = item.stage === stage.key;
        return (
          <li key={stage.key} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1 rounded-md border px-1.5 py-1 text-[0.65rem] uppercase tracking-[0.08em]",
                complete && "border-primary/40 text-primary",
                current && !item.blocked && "border-primary text-primary",
                current && item.blocked && "border-destructive/60 text-destructive",
                !complete && !current && "border-border/50 text-muted-foreground",
              )}
            >
              {complete ? (
                <Check aria-hidden className="size-3 shrink-0" />
              ) : current ? (
                item.blocked ? (
                  <TriangleAlert aria-hidden className="size-3 shrink-0" />
                ) : (
                  <Loader2 aria-hidden className="size-3 shrink-0 animate-spin" />
                )
              ) : null}
              <span className="truncate">{stage.label}</span>
            </span>
            {index < STAGES.length - 1 ? (
              <span aria-hidden className="h-px w-2 shrink-0 bg-border/60" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ItemRow({ item, onNavigate }: { item: SuggestionItem; onNavigate: () => void }) {
  return (
    <li className="rounded-xl border border-border/60 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{item.title}</p>
        <StatePill label={item.state} tone={item.blocked ? "danger" : toneForState(item.state)} />
      </div>
      {item.targetUrl ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.targetUrl}</p>
      ) : null}
      <StageTrack item={item} />
      <p className="mt-2 text-xs text-muted-foreground">{item.statusLine}</p>
      <p className="mt-1 text-xs font-medium text-primary">{item.instruction}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[0.65rem] text-muted-foreground">{formatWhen(item.updatedAt)}</span>
        {item.actionId ? (
          <Link
            to={item.actionTo}
            params={{ id: item.actionId }}
            onClick={onNavigate}
            className="rounded-lg border border-primary/50 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {item.actionLabel}
          </Link>
        ) : (
          <Link
            to={item.actionTo}
            onClick={onNavigate}
            className="rounded-lg border border-primary/50 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {item.actionLabel}
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Global propose -> approve -> execute panel. It is reachable from every
 * screen and refreshes itself so the stage shown is the stored stage.
 */
export function SuggestionsPanel({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(listSuggestionPipeline);
  const query = useQuery({
    queryKey: ["suggestion-pipeline"],
    queryFn: () => load(),
    refetchInterval: open ? 10_000 : 60_000,
    refetchOnWindowFocus: true,
  });

  const items = query.data?.items ?? [];
  const waiting = (query.data?.counts.propose ?? 0) + (query.data?.counts.execute ?? 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open the suggestions pipeline"
        title="Suggestions"
        className={cn(
          "flex items-center rounded-lg border border-border/70 text-sm text-foreground transition-colors hover:border-primary/50 hover:text-primary",
          collapsed ? "size-10 justify-center" : "w-full gap-2 px-2.5 py-2",
        )}
      >
        <GitPullRequestArrow aria-hidden className="size-4 shrink-0 text-primary" />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-left">Suggestions</span>
            {waiting > 0 ? (
              <span className="shrink-0 rounded-md border border-primary/50 px-1.5 text-xs text-primary">
                {waiting}
              </span>
            ) : null}
          </>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="scrollbar-none flex w-full flex-col gap-0 overflow-y-auto border-border/60 bg-sidebar px-4 py-6 sm:max-w-md"
      >
        <div className="pr-8">
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            Propose, approve, execute
          </p>
          <h2 className="text-base font-semibold text-foreground">Suggestions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {query.isPending
              ? "Reading stored state…"
              : query.isError
                ? "Could not read the pipeline. Sign in again, then reopen this panel."
                : `${items.length} item(s), ${waiting} waiting on you. Updated ${formatWhen(
                    query.data?.fetchedAt,
                  )}.`}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-1">
          {STAGES.map((stage) => (
            <div key={stage.key} className="rounded-lg border border-border/60 px-2 py-1.5">
              <p className="text-sm font-semibold text-foreground">
                {query.data?.counts[stage.key] ?? 0}
              </p>
              <p className="text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">
                {stage.label}
              </p>
            </div>
          ))}
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <ItemRow key={`${item.kind}-${item.id}`} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </ul>

        {!query.isPending && !query.isError && items.length === 0 ? (
          <EmptyNote className="mt-4">
            Nothing is in flight. Run an observation workflow to raise the first suggestion.
          </EmptyNote>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
