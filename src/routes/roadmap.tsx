import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyNote,
  EmptyState,
  GlassCard,
  PageHeader,
  PageStack,
  StatePill,
  formatWhen,
  type Tone,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addRoadmapComment,
  createRoadmapItem,
  deleteRoadmapItem,
  listRoadmap,
  updateRoadmapItem,
  type RoadmapItem,
  type RoadmapPriority,
  type RoadmapStatus,
} from "@/lib/roadmap.functions";

export const Route = createFileRoute("/roadmap")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Build roadmap — Marky" },
      {
        name: "description",
        content:
          "The shared build queue: add what you want built, watch it move from requested to shipped, and keep the discussion on the item itself.",
      },
      { property: "og:title", content: "Build roadmap — Marky" },
      {
        property: "og:description",
        content: "Add what you want built and follow it from requested to shipped.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoadmapPage,
});

const STATUS_LANES: readonly { key: RoadmapStatus; label: string; hint: string; tone: Tone }[] = [
  {
    key: "requested",
    label: "Requested",
    hint: "Waiting to be picked up. Highest priority goes first.",
    tone: "warning",
  },
  { key: "in_progress", label: "In progress", hint: "Being built right now.", tone: "info" },
  {
    key: "shipped",
    label: "Shipped",
    hint: "Done and live. Kept as build history.",
    tone: "positive",
  },
  {
    key: "parked",
    label: "Parked",
    hint: "Deliberately on hold. Nothing is lost.",
    tone: "neutral",
  },
];

const PRIORITY_LABEL: Record<RoadmapPriority, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

const PRIORITY_TONE: Record<RoadmapPriority, Tone> = {
  now: "warning",
  next: "info",
  later: "neutral",
};

const PRIORITY_RANK: Record<RoadmapPriority, number> = { now: 0, next: 1, later: 2 };

function RoadmapCard({
  item,
  onStatus,
  onDelete,
  onComment,
  busy,
}: {
  item: RoadmapItem;
  onStatus: (status: RoadmapStatus) => void;
  onDelete: () => void;
  onComment: (body: string) => void;
  busy: boolean;
}) {
  const [showThread, setShowThread] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
          {item.detail ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {item.detail}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
            <StatePill label={PRIORITY_LABEL[item.priority]} tone={PRIORITY_TONE[item.priority]} />
            <span>Added {formatWhen(item.createdAt)}</span>
            {item.linkedUrl ? (
              <a
                href={item.linkedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open link <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : null}
          </p>
          {item.shippedNote ? (
            <p className="text-xs text-muted-foreground">Shipped: {item.shippedNote}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={item.status}
            onValueChange={(value) => onStatus(value as RoadmapStatus)}
            disabled={busy}
          >
            <SelectTrigger className="h-8 w-[9.5rem] text-xs" aria-label="Move this item">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_LANES.map((lane) => (
                <SelectItem key={lane.key} value={lane.key}>
                  {lane.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowThread((open) => !open)}
            aria-expanded={showThread}
            aria-label={`Discuss ${item.title}`}
          >
            <MessageSquare aria-hidden className="size-3.5" />
            {item.comments.length > 0 ? item.comments.length : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Remove ${item.title}`}
          >
            <Trash2 aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      {showThread ? (
        <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
          {item.comments.length === 0 ? (
            <EmptyNote>No discussion yet. Leave the first note below.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {item.comments.map((comment) => (
                <li key={comment.id} className="rounded-lg border border-border/50 px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {formatWhen(comment.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add context, a constraint, or a decision"
              rows={2}
              className="min-h-[2.5rem]"
              aria-label={`Comment on ${item.title}`}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || draft.trim().length === 0}
              onClick={() => {
                onComment(draft.trim());
                setDraft("");
              }}
            >
              Post note
            </Button>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function RoadmapPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listRoadmap);
  const create = useServerFn(createRoadmapItem);
  const update = useServerFn(updateRoadmapItem);
  const remove = useServerFn(deleteRoadmapItem);
  const comment = useServerFn(addRoadmapComment);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<RoadmapPriority>("next");
  const [linkedUrl, setLinkedUrl] = useState("");

  const roadmapQuery = useQuery({
    queryKey: ["roadmap-items"],
    queryFn: () => list({ data: undefined }),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["roadmap-items"] });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: title.trim(),
          detail: detail.trim(),
          priority,
          linkedUrl: linkedUrl.trim() ? linkedUrl.trim() : null,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setDetail("");
      setLinkedUrl("");
      void invalidate();
      toast.success("Added to the roadmap");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not add that item"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; status: RoadmapStatus }) =>
      update({ data: { id: input.id, status: input.status } }),
    onSuccess: () => void invalidate(),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not move that item"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      void invalidate();
      toast.success("Item removed");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not remove that item"),
  });

  const commentMutation = useMutation({
    mutationFn: (input: { itemId: string; body: string }) => comment({ data: input }),
    onSuccess: () => void invalidate(),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not post that note"),
  });

  const busy = updateMutation.isPending || deleteMutation.isPending || commentMutation.isPending;

  const lanes = useMemo(() => {
    const items = roadmapQuery.data ?? [];
    return STATUS_LANES.map((lane) => ({
      ...lane,
      items: items
        .filter((item) => item.status === lane.key)
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.sortOrder - b.sortOrder ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    }));
  }, [roadmapQuery.data]);

  const total = roadmapQuery.data?.length ?? 0;

  return (
    <PageStack>
      <PageHeader
        eyebrow="Build roadmap"
        title="What we are building next"
        description="Type what you want built instead of explaining it in chat. Items move from requested to in progress to shipped, and nothing is deleted, so this doubles as the build history."
      />

      <GlassCard glow>
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Add the next thing to build</p>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && title.trim() && !createMutation.isPending) {
                event.preventDefault();
                createMutation.mutate();
              }
            }}
            placeholder="One line: what should exist that does not exist yet"
            maxLength={200}
            aria-label="Roadmap item title"
          />
          <Textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="Optional detail: how it should behave, what it must not do, where it lives"
            rows={3}
            aria-label="Roadmap item detail"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as RoadmapPriority)}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Now</SelectItem>
                <SelectItem value="next">Next</SelectItem>
                <SelectItem value="later">Later</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={linkedUrl}
              onChange={(event) => setLinkedUrl(event.target.value)}
              placeholder="Optional link: a page, workflow, or evidence screen"
              maxLength={500}
              aria-label="Related link"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || title.trim().length === 0}
              className="shrink-0"
            >
              <Plus aria-hidden className="size-4" />
              {createMutation.isPending ? "Adding…" : "Add item"}
            </Button>
          </div>
        </div>
      </GlassCard>

      {roadmapQuery.isLoading ? (
        <EmptyNote>Loading the roadmap…</EmptyNote>
      ) : total === 0 ? (
        <EmptyState
          gapless
          title="No roadmap items yet"
          description="Add the first one above and it will show up here as Requested."
        />
      ) : (
        <div className="space-y-8">
          {lanes.map((lane) => (
            <section key={lane.key} aria-label={lane.label} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-semibold text-foreground">{lane.label}</h2>
                <StatePill label={String(lane.items.length)} tone={lane.tone} />
                <p className="text-xs text-muted-foreground">{lane.hint}</p>
              </div>
              {lane.items.length === 0 ? (
                <EmptyNote>Nothing here.</EmptyNote>
              ) : (
                <div className="space-y-3">
                  {lane.items.map((item) => (
                    <RoadmapCard
                      key={item.id}
                      item={item}
                      busy={busy}
                      onStatus={(status) => updateMutation.mutate({ id: item.id, status })}
                      onDelete={() => deleteMutation.mutate(item.id)}
                      onComment={(body) => commentMutation.mutate({ itemId: item.id, body })}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </PageStack>
  );
}
