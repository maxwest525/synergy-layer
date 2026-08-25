import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Pin, PinOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  PageStack,
  formatWhen,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OperatorNote } from "@/lib/notes.functions";
import { createNote, deleteNote, listNotes, updateNote } from "@/lib/notes.functions";

export const Route = createFileRoute("/notes")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Notes pad — Marky" },
      {
        name: "description",
        content:
          "Private scratch space for the operator: jot a thought, pin what matters, and attach the page on the site it belongs to.",
      },
      { property: "og:title", content: "Notes pad — Marky" },
      {
        property: "og:description",
        content: "Private operator notes, pinned and linked to the pages they concern.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listNotes);
  const create = useServerFn(createNote);
  const update = useServerFn(updateNote);
  const remove = useServerFn(deleteNote);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkedUrl, setLinkedUrl] = useState("");

  const notesQuery = useQuery({
    queryKey: ["operator-notes"],
    queryFn: () => list({ data: undefined }),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["operator-notes"] });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: title.trim(),
          body: body.trim(),
          linkedUrl: linkedUrl.trim() ? linkedUrl.trim() : null,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setLinkedUrl("");
      toast.success("Note saved");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; title?: string; body?: string; pinned?: boolean }) =>
      update({ data: input }),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Note deleted");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const notes = notesQuery.data ?? [];

  return (
    <PageStack>
      <PageHeader
        eyebrow="Decisions"
        title="Notes pad"
        description="Your private scratch space. Write the thought down now, pin the ones you keep returning to, and attach the page on the site it belongs to."
      />

      <GlassCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">Write a note</h2>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title, for example: rewrite the long distance page intro"
        />
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What you are thinking. Nothing here is published or acted on."
          rows={5}
        />
        <Input
          value={linkedUrl}
          onChange={(event) => setLinkedUrl(event.target.value)}
          placeholder="Attach a page on your site, for example: https://trumoveinc.com/long-distance"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Notes are visible only to you.</p>
          <Button
            variant="outline"
            disabled={createMutation.isPending || (!title.trim() && !body.trim())}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Saving..." : "Save note"}
          </Button>
        </div>
      </GlassCard>

      {notesQuery.isLoading ? (
        <GlassCard className="p-5 text-sm text-muted-foreground">Loading your notes...</GlassCard>
      ) : notes.length === 0 ? (
        <EmptyState
          gapless
          title="No notes yet"
          description="Write your first note above. Start with the one thing you keep meaning to fix on the site."
        />
      ) : (
        <div className="grid gap-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onSave={(patch) => updateMutation.mutate({ id: note.id, ...patch })}
              onTogglePin={() => updateMutation.mutate({ id: note.id, pinned: !note.pinned })}
              onDelete={() => deleteMutation.mutate(note.id)}
            />
          ))}
        </div>
      )}
    </PageStack>
  );
}

function NoteCard({
  note,
  onSave,
  onTogglePin,
  onDelete,
}: {
  note: OperatorNote;
  onSave: (patch: { title: string; body: string }) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const dirty = title !== note.title || body !== note.body;

  return (
    <GlassCard className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="border-transparent bg-transparent px-0 text-base font-semibold"
          placeholder="Untitled note"
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onTogglePin}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
          >
            {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete note">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Updated {formatWhen(note.updatedAt)}</span>
        <div className="flex items-center gap-2">
          {note.linkedUrl ? (
            <a
              href={note.linkedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open page <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {dirty ? (
            <Button variant="outline" size="sm" onClick={() => onSave({ title, body })}>
              Save changes
            </Button>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
