import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The shared build roadmap. Unlike notes, roadmap items are tenant wide: the
 * operator and the agent both read and write the same queue, so "what is next"
 * lives on a screen instead of inside a chat thread.
 */
export type RoadmapStatus = "requested" | "in_progress" | "shipped" | "parked";
export type RoadmapPriority = "now" | "next" | "later";

export type RoadmapComment = {
  id: string;
  itemId: string;
  body: string;
  authorId: string | null;
  createdAt: string;
};

export type RoadmapItem = {
  id: string;
  title: string;
  detail: string;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  linkedUrl: string | null;
  sortOrder: number;
  createdBy: string | null;
  shippedNote: string | null;
  createdAt: string;
  updatedAt: string;
  comments: RoadmapComment[];
};

type ItemRow = {
  id: string;
  title: string | null;
  detail: string | null;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  linked_url: string | null;
  sort_order: number | null;
  created_by: string | null;
  shipped_note: string | null;
  created_at: string;
  updated_at: string;
};

type CommentRow = {
  id: string;
  item_id: string;
  body: string | null;
  author_id: string | null;
  created_at: string;
};

const ITEM_COLUMNS =
  "id, title, detail, status, priority, linked_url, sort_order, created_by, shipped_note, created_at, updated_at";

function toItem(row: ItemRow, comments: RoadmapComment[]): RoadmapItem {
  return {
    id: row.id,
    title: row.title ?? "",
    detail: row.detail ?? "",
    status: row.status,
    priority: row.priority,
    linkedUrl: row.linked_url,
    sortOrder: row.sort_order ?? 0,
    createdBy: row.created_by,
    shippedNote: row.shipped_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    comments,
  };
}

function toComment(row: CommentRow): RoadmapComment {
  return {
    id: row.id,
    itemId: row.item_id,
    body: row.body ?? "",
    authorId: row.author_id,
    createdAt: row.created_at,
  };
}

const statusValues = ["requested", "in_progress", "shipped", "parked"] as const;
const priorityValues = ["now", "next", "later"] as const;

const createInput = z.object({
  title: z.string().trim().min(1, "Give the item a title.").max(200),
  detail: z.string().max(20000).default(""),
  priority: z.enum(priorityValues).default("next"),
  linkedUrl: z.string().max(500).nullable().default(null),
});

export const listRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoadmapItem[]> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { data: rows, error } = await context.supabase
      .from("roadmap_items")
      .select(ITEM_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const items = (rows ?? []) as ItemRow[];
    if (items.length === 0) return [];

    const { data: commentRows, error: commentError } = await context.supabase
      .from("roadmap_comments")
      .select("id, item_id, body, author_id, created_at")
      .eq("tenant_id", tenantId)
      .in(
        "item_id",
        items.map((row) => row.id),
      )
      .order("created_at", { ascending: true })
      .limit(2000);
    if (commentError) throw new Error(commentError.message);

    const byItem = new Map<string, RoadmapComment[]>();
    for (const row of (commentRows ?? []) as CommentRow[]) {
      const comment = toComment(row);
      const bucket = byItem.get(comment.itemId);
      if (bucket) bucket.push(comment);
      else byItem.set(comment.itemId, [comment]);
    }

    return items.map((row) => toItem(row, byItem.get(row.id) ?? []));
  });

export const createRoadmapItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createInput.parse(raw))
  .handler(async ({ context, data }): Promise<RoadmapItem> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { data: row, error } = await context.supabase
      .from("roadmap_items")
      .insert({
        tenant_id: tenantId,
        created_by: context.userId,
        title: data.title,
        detail: data.detail,
        priority: data.priority,
        linked_url: data.linkedUrl,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toItem(row as ItemRow, []);
  });

export const updateRoadmapItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(200).optional(),
        detail: z.string().max(20000).optional(),
        status: z.enum(statusValues).optional(),
        priority: z.enum(priorityValues).optional(),
        linkedUrl: z.string().max(500).nullable().optional(),
        shippedNote: z.string().max(2000).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<RoadmapItem> => {
    const patch: {
      title?: string;
      detail?: string;
      status?: RoadmapStatus;
      priority?: RoadmapPriority;
      linked_url?: string | null;
      shipped_note?: string | null;
      sort_order?: number;
    } = {};
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.detail !== undefined) patch["detail"] = data.detail;
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.priority !== undefined) patch["priority"] = data.priority;
    if (data.linkedUrl !== undefined) patch["linked_url"] = data.linkedUrl;
    if (data.shippedNote !== undefined) patch["shipped_note"] = data.shippedNote;
    if (data.sortOrder !== undefined) patch["sort_order"] = data.sortOrder;

    const { data: row, error } = await context.supabase
      .from("roadmap_items")
      .update(patch)
      .eq("id", data.id)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toItem(row as ItemRow, []);
  });

export const deleteRoadmapItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { error } = await context.supabase.from("roadmap_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const addRoadmapComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ itemId: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<RoadmapComment> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { data: row, error } = await context.supabase
      .from("roadmap_comments")
      .insert({
        tenant_id: tenantId,
        item_id: data.itemId,
        author_id: context.userId,
        body: data.body,
      })
      .select("id, item_id, body, author_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return toComment(row as CommentRow);
  });
