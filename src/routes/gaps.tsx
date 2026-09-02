import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyNote,
  GlassCard,
  PageHeader,
  PageStack,
  StatePill,
  type Tone,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import {
  CONNECTION_SURFACES,
  connectionCounts,
  gapRoadmapDraft,
  surfaceCounts,
  type SurfaceOperation,
  type SurfaceStatus,
} from "@/lib/connectors/surface-inventory";
import { createRoadmapItem, listRoadmap } from "@/lib/roadmap.functions";

export const Route = createFileRoute("/gaps")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Connection gaps · Marky" },
      {
        name: "description",
        content:
          "Every provider operation on every connection, marked wired, partly wired, or not built, with one click to put the gap on the roadmap.",
      },
      { property: "og:title", content: "Connection gaps · Marky" },
      {
        property: "og:description",
        content: "Every operation we could call, and the honest status of each one.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GapsRoute,
});

const STATUS_LABEL: Record<SurfaceStatus, string> = {
  wired: "wired",
  partial: "partly wired",
  not_built: "not built",
};

const STATUS_TONE: Record<SurfaceStatus, Tone> = {
  wired: "positive",
  partial: "warning",
  not_built: "danger",
};

type Filter = "gaps" | "all" | SurfaceStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "gaps", label: "Gaps only" },
  { key: "all", label: "Everything" },
  { key: "wired", label: "Wired" },
  { key: "partial", label: "Partly wired" },
  { key: "not_built", label: "Not built" },
];

function GapsRoute() {
  const [filter, setFilter] = useState<Filter>("gaps");
  const queryClient = useQueryClient();
  const fetchRoadmap = useServerFn(listRoadmap);
  const addItem = useServerFn(createRoadmapItem);

  const roadmap = useQuery({ queryKey: ["roadmap"], queryFn: () => fetchRoadmap() });
  const filedTitles = useMemo(
    () => new Set((roadmap.data ?? []).map((item) => item.title.trim().toLowerCase())),
    [roadmap.data],
  );

  const file = useMutation({
    mutationFn: (input: { title: string; detail: string }) =>
      addItem({ data: { ...input, priority: "next", linkedUrl: null } }),
    onSuccess: (item) => {
      toast.success(`Filed on the roadmap: ${item.title}`);
      void queryClient.invalidateQueries({ queryKey: ["roadmap"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = surfaceCounts();

  const matches = (entry: SurfaceOperation) => {
    if (filter === "all") return true;
    if (filter === "gaps") return entry.status !== "wired";
    return entry.status === filter;
  };

  return (
    <PageStack>
      <PageHeader
        eyebrow="System health"
        title="Connection gaps"
        description={`Every operation each connection exposes, and whether this build actually calls it. ${totals.wired} of ${totals.total} are wired, ${totals.partial} are partly wired, ${totals.notBuilt} are not built. Status describes this codebase, not a proven live call.`}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <Button
            key={entry.key}
            variant={filter === entry.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(entry.key)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {CONNECTION_SURFACES.map((surface) => {
        const rows = surface.operations.filter(matches);
        if (rows.length === 0) return null;
        const counts = connectionCounts(surface);
        return (
          <GlassCard key={surface.key} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">{surface.label}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {surface.provider} · {surface.auth}
                </p>
              </div>
              <StatePill
                label={`${counts.wired}/${counts.total} wired`}
                tone={counts.wired === counts.total ? "positive" : "warning"}
              />
            </div>
            {surface.note ? (
              <p className="mt-2 text-sm text-muted-foreground">{surface.note}</p>
            ) : null}

            <ul className="mt-4 space-y-2">
              {rows.map((entry) => {
                const draft = gapRoadmapDraft(surface, entry);
                const filed = filedTitles.has(draft.title.trim().toLowerCase());
                return (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-border/60 bg-background/30 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          <span className="font-mono text-[13px]">{entry.operation}</span>{" "}
                          <span className="text-muted-foreground">&mdash;</span>{" "}
                          <span className="text-muted-foreground">{entry.purpose}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <StatePill
                            label={STATUS_LABEL[entry.status]}
                            tone={STATUS_TONE[entry.status]}
                          />
                          {entry.mutates ? (
                            <span className="text-xs text-warning">
                              writes at the provider, needs approval
                            </span>
                          ) : null}
                          {entry.evidence ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              {entry.evidence}
                            </span>
                          ) : null}
                        </div>
                        {entry.gap ? (
                          <p className="mt-1 text-sm text-muted-foreground">{entry.gap}</p>
                        ) : null}
                      </div>

                      {entry.status === "wired" ? null : filed ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-primary">
                          <Check className="size-3.5" />
                          On the roadmap
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={file.isPending}
                          onClick={() => file.mutate(draft)}
                        >
                          <Plus className="size-3.5" />
                          Put it on the roadmap
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        );
      })}

      {roadmap.isError ? (
        <EmptyNote>
          The roadmap could not be read, so filed items are not marked. The inventory above is still
          accurate.
        </EmptyNote>
      ) : null}
    </PageStack>
  );
}
