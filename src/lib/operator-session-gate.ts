type WorkspaceAccessInput = {
  ready: boolean;
  signedIn: boolean;
  onAuthRoute: boolean;
};

export function getInitialOperatorSession(): {
  ready: true;
  email: null;
  signedIn: false;
} {
  return { ready: true, email: null, signedIn: false };
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

export function resolveOperatorEmail(
  loadEmail: () => Promise<string | null>,
  timeoutMs = 3_000,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (email: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(email);
    };
    const timeout = setTimeout(() => finish(null), timeoutMs);

    void loadEmail().then(finish, () => finish(null));
  });
}
