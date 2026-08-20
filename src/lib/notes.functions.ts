import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * A private operator notes pad. Notes are scratch space, not evidence: they are
 * scoped to the author inside the active tenant and never feed scoring,
 * proposals, or execution.
 */
export type OperatorNote = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  linkedUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoteRow = {
  id: string;
  title: string | null;
  body: string | null;
  pinned: boolean | null;
  linked_url: string | null;
  created_at: string;
  updated_at: string;
};

function toNote(row: NoteRow): OperatorNote {
  return {
    id: row.id,
    title: row.title ?? "",
    body: row.body ?? "",
    pinned: Boolean(row.pinned),
    linkedUrl: row.linked_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const noteInput = z.object({
  title: z.string().max(200).default(""),
  body: z.string().max(20000).default(""),
  linkedUrl: z.string().max(500).nullable().default(null),
});

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperatorNote[]> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { data, error } = await context.supabase
      .from("operator_notes")
      .select("id, title, body, pinned, linked_url, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toNote(row as NoteRow));
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => noteInput.parse(raw))
  .handler(async ({ context, data }): Promise<OperatorNote> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { data: row, error } = await context.supabase
      .from("operator_notes")
      .insert({
        tenant_id: tenantId,
        author_id: context.userId,
        title: data.title,
        body: data.body,
        linked_url: data.linkedUrl,
      })
      .select("id, title, body, pinned, linked_url, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return toNote(row as NoteRow);
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    noteInput
      .partial()
      .extend({ id: z.string().uuid(), pinned: z.boolean().optional() })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<OperatorNote> => {
    const patch: {
      title?: string;
      body?: string;
      linked_url?: string | null;
      pinned?: boolean;
    } = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.body !== undefined) patch.body = data.body;
    if (data.linkedUrl !== undefined) patch.linked_url = data.linkedUrl;
    if (data.pinned !== undefined) patch.pinned = data.pinned;

    const { data: row, error } = await context.supabase
      .from("operator_notes")
      .update(patch)
      .eq("id", data.id)
      .select("id, title, body, pinned, linked_url, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return toNote(row as NoteRow);
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { error } = await context.supabase.from("operator_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
