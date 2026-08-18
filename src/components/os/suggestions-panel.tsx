import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, GitPullRequestArrow, Loader2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyNote, StatePill, formatWhen, toneForState } from "./primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { decideChangeRequestsBulk } from "@/lib/change-requests.functions";
import type { PipelineStage, SuggestionItem } from "@/lib/suggestions.functions";
import { listSuggestionPipeline } from "@/lib/suggestions.functions";
import { cn } from "@/lib/utils";

/** Only proposed page changes can be decided straight from this panel. */
function isDecidable(item: SuggestionItem): boolean {
  return item.kind === "change" && item.state === "proposed";
}

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
          <li key={stage.key} className="flex flex-1 items-center gap-1">
            <span
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md border px-1 py-1 text-[0.6rem] uppercase tracking-[0.06em]",
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
              <span>{stage.label}</span>
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

function ItemRow({
  item,
  onNavigate,
  selectable,
  selected,
  onSelectedChange,
  note,
  onNoteChange,
  busy,
}: {
  item: SuggestionItem;
  onNavigate: () => void;
  selectable: boolean;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
  note: string;
  onNoteChange: (next: string) => void;
  busy: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-3",
        selected ? "border-primary/60 bg-primary/5" : "border-border/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {selectable ? (
          <Checkbox
            checked={selected}
            onCheckedChange={(value) => onSelectedChange(value === true)}
            disabled={busy}
            aria-label={`Select ${item.title} for a bulk decision`}
            className="mt-0.5 shrink-0"
          />
        ) : null}
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{item.title}</p>
        <StatePill label={item.state} tone={item.blocked ? "danger" : toneForState(item.state)} />
      </div>
      {item.targetUrl ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.targetUrl}</p>
      ) : null}
      <StageTrack item={item} />
      <p className="mt-2 text-xs text-muted-foreground">{item.statusLine}</p>
      <p className="mt-1 text-xs font-medium text-primary">{item.instruction}</p>
      {selectable && selected ? (
        <Textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          maxLength={2000}
          rows={2}
          disabled={busy}
          placeholder="Note for this item (optional). It is stored with the decision."
          className="mt-2 text-xs"
          aria-label={`Decision note for ${item.title}`}
        />
      ) : null}
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const load = useServerFn(listSuggestionPipeline);
  const decideBulk = useServerFn(decideChangeRequestsBulk);
  const query = useQuery({
    queryKey: ["suggestion-pipeline"],
    queryFn: () => load(),
    refetchInterval: open ? 10_000 : 60_000,
    refetchOnWindowFocus: true,
  });

  const items = query.data?.items ?? [];
  const waiting = (query.data?.counts.propose ?? 0) + (query.data?.counts.execute ?? 0);

  const decidable = useMemo(() => items.filter(isDecidable), [items]);
  const selectedIds = useMemo(
    () => decidable.filter((item) => selected[item.id]).map((item) => item.id),
    [decidable, selected],
  );

  const bulk = useMutation({
    mutationFn: async (decision: "approve" | "reject") =>
      decideBulk({
        data: {
          decision,
          items: selectedIds.map((id) => ({
            id,
            notes: (notes[id] ?? "").trim() === "" ? null : (notes[id] ?? "").trim(),
          })),
        },
      }),
    onSuccess: async (result) => {
      const verb = result.decision === "approve" ? "Approved" : "Rejected";
      if (result.failed === 0) {
        toast.success(`${verb} ${result.succeeded} suggestion(s).`);
      } else {
        const firstError = result.outcomes.find((outcome) => !outcome.ok)?.error;
        toast.error(
          `${verb} ${result.succeeded}, ${result.failed} could not be recorded. ${firstError ?? ""}`.trim(),
        );
      }
      setSelected({});
      setNotes({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["suggestion-pipeline"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["change-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center"] }),
      ]);
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "The decisions could not be recorded.",
      );
    },
  });

  const busy = bulk.isPending;
  const allSelected = decidable.length > 0 && selectedIds.length === decidable.length;

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

        {decidable.length > 0 ? (
          <div className="mt-4 rounded-xl border border-border/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) =>
                    setSelected(
                      value === true
                        ? Object.fromEntries(decidable.map((item) => [item.id, true]))
                        : {},
                    )
                  }
                  disabled={busy}
                  aria-label="Select every suggestion waiting on you"
                />
                Select all waiting on you ({decidable.length})
              </label>
              <span className="text-[0.65rem] text-muted-foreground">
                {selectedIds.length} selected
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Select the suggestions you agree with, add a note per item if the decision needs
              explaining, then decide them together.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || selectedIds.length === 0}
                onClick={() => bulk.mutate("approve")}
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                {busy && bulk.variables === "approve"
                  ? "Approving..."
                  : `Approve ${selectedIds.length || ""}`.trim()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || selectedIds.length === 0}
                onClick={() => bulk.mutate("reject")}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                {busy && bulk.variables === "reject"
                  ? "Rejecting..."
                  : `Reject ${selectedIds.length || ""}`.trim()}
              </Button>
            </div>
          </div>
        ) : null}

        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => {
            const selectable = isDecidable(item);
            return (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                onNavigate={() => setOpen(false)}
                selectable={selectable}
                selected={selectable && Boolean(selected[item.id])}
                onSelectedChange={(next) =>
                  setSelected((prev) => ({ ...prev, [item.id]: next }))
                }
                note={notes[item.id] ?? ""}
                onNoteChange={(next) => setNotes((prev) => ({ ...prev, [item.id]: next }))}
                busy={busy}
              />
            );
          })}
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
