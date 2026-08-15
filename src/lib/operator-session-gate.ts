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
