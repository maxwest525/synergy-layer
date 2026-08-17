import { createMiddleware } from "@tanstack/react-start";

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const stored = JSON.parse(raw) as unknown;
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
      const token = (stored as { access_token?: unknown }).access_token;
      if (typeof token === "string" && token.split(".").length === 3) return token;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Attaches the already-persisted bearer token without waiting on the auth
 * client's session lock. The server middleware still validates its signature,
 * claims, and user identity before any protected handler runs.
 */
export const attachStoredAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = readStoredAccessToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
