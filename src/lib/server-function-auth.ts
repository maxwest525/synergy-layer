import { createMiddleware } from "@tanstack/react-start";

/** Seconds of remaining life below which a stored token is treated as stale. */
const EXPIRY_MARGIN_SECONDS = 30;

function decodeJwtExpiry(token: string): number | null {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function parseStoredSession(raw: string): unknown {
  const value = raw.startsWith("base64-")
    ? (() => {
        try {
          return atob(raw.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/"));
        } catch {
          return raw;
        }
      })()
    : raw;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const stored = parseStoredSession(raw);
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
      const token = (stored as { access_token?: unknown }).access_token;
      if (typeof token !== "string" || token.split(".").length !== 3) continue;

      // An expired token is worse than no token: the server rejects it with
      // "Unauthorized: Invalid token" instead of letting the client refresh.
      const exp = decodeJwtExpiry(token);
      if (exp !== null && exp - EXPIRY_MARGIN_SECONDS <= Math.floor(Date.now() / 1000)) {
        continue;
      }
      return token;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Attaches the already-persisted bearer token without waiting on the auth
 * client's session lock. When the stored token is missing or expired, the auth
 * client is asked for a refreshed session before the call goes out. The server
 * middleware still validates signature, claims, and identity.
 */
export const attachStoredAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token = readStoredAccessToken();

  if (!token) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      token = null;
    }
  }

  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
