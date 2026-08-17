type WorkspaceAccessInput = {
  ready: boolean;
  signedIn: boolean;
  onAuthRoute: boolean;
};

/**
 * A browser that already holds a persisted auth token will resolve a real
 * session a tick later. Treating that first tick as "signed out" bounces a
 * signed-in operator to /auth on every hard reload, so hold as "loading"
 * until the auth client reports.
 */
export function hasStoredAuthToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && /^sb-.*-auth-token$/.test(key)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function getInitialOperatorSession(): {
  ready: boolean;
  email: null;
  signedIn: false;
} {
  return { ready: !hasStoredAuthToken(), email: null, signedIn: false };
}

/**
 * Reads only enough persisted-session metadata to release the visual shell gate.
 * Authorization still happens on the server for every protected operation.
 *
 * This deliberately does not call auth.getSession(): that call takes the auth
 * client's session lock and can serialize every server-function request behind
 * it during a cold load.
 */
export function readStoredOperatorEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const stored = JSON.parse(raw) as unknown;
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
      const user = (stored as { user?: unknown }).user;
      if (!user || typeof user !== "object" || Array.isArray(user)) continue;
      const email = (user as { email?: unknown }).email;
      if (typeof email === "string" && email.length > 0) return email;
    }
  } catch {
    return null;
  }
  return null;
}

export function getWorkspaceAccessState({
  ready,
  signedIn,
  onAuthRoute,
}: WorkspaceAccessInput): "loading" | "signed-out" | "ready" {
  if (onAuthRoute) return "ready";
  if (!ready) return "loading";
  return signedIn ? "ready" : "signed-out";
}
