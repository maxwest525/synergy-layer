import { createHash, randomBytes } from "node:crypto";

/**
 * A DataForSEO Standard-queue task calls back with no custom headers, so the
 * only thing that can authenticate the callback is what the postback URL
 * itself carries. Until 2026-09-02 that was the project's publishable key,
 * which ships in the browser bundle; now it is a random token minted per
 * task. The database stores the token's SHA-256, never the token, so a read
 * of the table cannot forge a callback (BACKLOG CODE-34).
 */

const TOKEN_BYTES = 24;

export function newPostbackToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashPostbackToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The URL handed to the provider. `$id` and `$tag` are the provider's own placeholders. */
export function postbackUrl(origin: string, token: string): string {
  return `${origin}/api/public/hooks/dataforseo-postback?id=$id&tag=$tag&token=${encodeURIComponent(token)}`;
}

export type QueuedTaskRef = { tenant_id: string; provider_task_id: string; tag: string };

export type PostbackDecision =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "no_token" | "unknown_token" | "task_mismatch" };

/**
 * Pure decision: the presented token must hash to a queued task, and the
 * body must be about that task (provider id and tag both match). Every
 * refusal is answered identically by the route, so the reason is for the
 * server log only.
 */
export function decidePostback(input: {
  token: string | null;
  queued: QueuedTaskRef | null;
  body: { tasks?: { id?: string; data?: Record<string, unknown> }[] } | null;
}): PostbackDecision {
  if (!input.token) return { ok: false, reason: "no_token" };
  if (!input.queued) return { ok: false, reason: "unknown_token" };
  const first = input.body?.tasks?.[0];
  const bodyId = typeof first?.id === "string" ? first.id : null;
  const bodyTag = typeof first?.data?.["tag"] === "string" ? (first.data["tag"] as string) : null;
  if (bodyId !== input.queued.provider_task_id || bodyTag !== input.queued.tag) {
    return { ok: false, reason: "task_mismatch" };
  }
  return { ok: true, tenantId: input.queued.tenant_id };
}
