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

export function getWorkspaceAccessState({
  ready,
  signedIn,
  onAuthRoute,
}: WorkspaceAccessInput): "loading" | "signed-out" | "ready" {
  if (onAuthRoute) return "ready";
  if (!ready) return "loading";
  return signedIn ? "ready" : "signed-out";
}
