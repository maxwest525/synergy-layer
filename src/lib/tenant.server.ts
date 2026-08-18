import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/start-server-core";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

function publishableFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Request-scoped Supabase client. When the caller carries a bearer token the
 * client acts as that operator, so tenant isolation is enforced by RLS rather
 * than by trusting a tenant id from the browser. Without a token the client is
 * anonymous and tenant tables simply return nothing.
 *
 * The client is built fresh for every call on purpose. Nothing that carries a
 * credential is kept in module state, so a bearer token can never outlive the
 * request that presented it or be reused by a later one.
 */
export function createRequestClient(): { db: Client; authenticated: boolean } {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

  let token: string | null = null;
  try {
    const header = getRequestHeader("authorization") ?? null;
    if (header?.startsWith("Bearer ")) {
      const candidate = header.slice(7);
      if (candidate.split(".").length === 3) token = candidate;
    }
  } catch {
    token = null;
  }

  const db = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: publishableFetch(key),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    },
  });

  if (token) clientFingerprints.set(db, createHash("sha256").update(token).digest("hex"));

  return { db, authenticated: token !== null };
}

/** Tenants the current caller may work in. Empty for anonymous requests. */
export async function listTenants(db: Client): Promise<TenantSummary[]> {
  const { data, error } = await db
    .from("tenants")
    .select("id, slug, name, description")
    .eq("status", "active")
    .order("name");
  if (error) return [];
  return data ?? [];
}

const resolvedCache = new WeakMap<Client, string>();

/**
 * Cross-request cache for the resolved tenant id.
 *
 * Only derived, non-secret data is stored: a tenant uuid. The key is a SHA-256
 * fingerprint of the bearer token, never the token itself, so one operator can
 * never read an entry written by another and nothing here can be replayed as a
 * credential. Entries expire quickly and are dropped outright when an operator
 * switches workspaces, so a stale selection cannot survive a switch.
 */
const clientFingerprints = new WeakMap<Client, string>();
const TENANT_CACHE_TTL_MS = 60_000;
const tenantCache = new Map<string, { tenantId: string; expiresAt: number }>();

function readTenantCache(db: Client): string | null {
  const fingerprint = clientFingerprints.get(db);
  if (!fingerprint) return null;
  const entry = tenantCache.get(fingerprint);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    tenantCache.delete(fingerprint);
    return null;
  }
  return entry.tenantId;
}

function writeTenantCache(db: Client, tenantId: string): void {
  const fingerprint = clientFingerprints.get(db);
  if (!fingerprint) return;
  if (tenantCache.size > 500) tenantCache.clear();
  tenantCache.set(fingerprint, { tenantId, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
}

function clearTenantCache(db: Client): void {
  const fingerprint = clientFingerprints.get(db);
  if (fingerprint) tenantCache.delete(fingerprint);
  resolvedCache.delete(db);
}

/**
 * Resolves the tenant a server operation belongs to. An explicit id is honoured
 * only when the caller can actually see that tenant; otherwise the operator's
 * saved active tenant wins, then their first membership, then the sole tenant
 * when the installation still has exactly one.
 */
export async function resolveTenantId(
  db: Client,
  explicit?: string | null,
): Promise<string | null> {
  if (explicit) {
    const { data } = await db.from("tenants").select("id").eq("id", explicit).maybeSingle();
    if (data?.id) return data.id;
  }

  const cached = resolvedCache.get(db) ?? readTenantCache(db);
  if (cached) {
    resolvedCache.set(db, cached);
    writeTenantCache(db, cached);
    return cached;
  }

  // Resolve all RLS-scoped fallbacks in one network wave. In the normal case
  // the profile wins; parallel fallbacks prevent an older account without an
  // active selection from paying two additional serial round trips.
  const [profileResult, membershipResult, tenantsResult] = await Promise.all([
    db
      .from("profiles")
      .select("active_tenant_id")
      .not("active_tenant_id", "is", null)
      .limit(1)
      .maybeSingle(),
    db.from("tenant_members").select("tenant_id").limit(1).maybeSingle(),
    db.from("tenants").select("id").limit(2),
  ]);
  const profile = profileResult.data;
  if (profile?.active_tenant_id) {
    resolvedCache.set(db, profile.active_tenant_id);
    writeTenantCache(db, profile.active_tenant_id);
    return profile.active_tenant_id;
  }

  const membership = membershipResult.data;
  if (membership?.tenant_id) {
    resolvedCache.set(db, membership.tenant_id);
    writeTenantCache(db, membership.tenant_id);
    return membership.tenant_id;
  }

  const tenants = tenantsResult.data;
  if (tenants && tenants.length === 1) {
    resolvedCache.set(db, tenants[0]!.id);
    writeTenantCache(db, tenants[0]!.id);
    return tenants[0]!.id;
  }

  return null;
}

/** Same as resolveTenantId but refuses to continue when no tenant applies. */
export async function requireTenantId(db: Client, explicit?: string | null): Promise<string> {
  const tenantId = await resolveTenantId(db, explicit);
  if (!tenantId) {
    throw new Error("No tenant is selected for this operation. Choose a client workspace first.");
  }
  return tenantId;
}

/** Remembers which client workspace an operator is working in. */
export async function setActiveTenant(db: Client, userId: string, tenantId: string): Promise<void> {
  const { data, error: lookupError } = await db
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!data) throw new Error("That client workspace is not available to this account.");

  const { error } = await db
    .from("profiles")
    .update({ active_tenant_id: tenantId })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  clearTenantCache(db);
  resolvedCache.set(db, tenantId);
  writeTenantCache(db, tenantId);
}
