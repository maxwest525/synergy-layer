import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side publishable client. Registry data is public-read by policy, so
 * this never needs the service role.
 */
export function createPublicServerClient(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

type ActivityInput = {
  actorKind?: string;
  actorId?: string | null;
  verb: string;
  subjectKind?: string | null;
  subjectId?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
};

/** Single entry point for the append-only activity log. */
export async function logActivity(
  client: SupabaseClient<Database>,
  event: ActivityInput,
): Promise<void> {
  const { error } = await client.from("activity_events").insert({
    actor_kind: event.actorKind ?? "system",
    actor_id: event.actorId ?? null,
    verb: event.verb,
    subject_kind: event.subjectKind ?? null,
    subject_id: event.subjectId ?? null,
    summary: event.summary,
    payload: (event.payload ?? {}) as never,
  });
  if (error) throw new Error(error.message);
}

type InboxInput = {
  lane: Database["public"]["Enums"]["inbox_lane"];
  sourceModule: string;
  title: string;
  summary?: string | null;
  priority?: number;
  subjectKind?: string | null;
  subjectId?: string | null;
  actions?: unknown[];
};

/** Every module files work into the unified Inbox through this helper. */
export async function fileInboxItem(
  client: SupabaseClient<Database>,
  item: InboxInput,
): Promise<void> {
  const { error } = await client.from("inbox_items").insert({
    lane: item.lane,
    source_module: item.sourceModule,
    title: item.title,
    summary: item.summary ?? null,
    priority: item.priority ?? 3,
    subject_kind: item.subjectKind ?? null,
    subject_id: item.subjectId ?? null,
    actions: (item.actions ?? []) as never,
  });
  if (error) throw new Error(error.message);
}

/** List variant of unwrap: a missing rowset is an empty list, never null. */
export function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}
