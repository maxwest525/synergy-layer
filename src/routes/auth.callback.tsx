import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { GlassCard, PageHeader } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { provisionSession } from "@/lib/auth.functions";

/** Only same-origin relative paths may be used as a post sign-in destination. */
function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => {
    const next = safeNext(search["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Completing sign-in — AOOS" },
      {
        name: "description",
        content: "AOOS is validating your session and checking operator access.",
      },
      { property: "og:title", content: "Completing sign-in — AOOS" },
      {
        property: "og:description",
        content: "AOOS is validating your session and checking operator access.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const next = safeNext(search["next" as keyof typeof search]);
  const provision = useServerFn(provisionSession);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setHasSession(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const result = useQuery({
    queryKey: ["auth", "provision"],
    queryFn: () => provision({ data: undefined }),
    enabled: hasSession === true,
    retry: false,
  });

  // A verified session always continues into the OS. Accounts without an
  // operator role land read only rather than parking on this page.
  // The verified session is the gate. If the access check itself fails or is
  // slow, still continue: the OS enforces roles on every action server-side.
  useEffect(() => {
    if (hasSession !== true) return undefined;
    if (!result.data && !result.error && result.isPending) {
      const slow = setTimeout(() => {
        window.location.replace(next ?? "/");
      }, 4000);
      return () => clearTimeout(slow);
    }
    const timer = setTimeout(() => {
      window.location.replace(next ?? "/");
    }, 600);
    return () => clearTimeout(timer);
  }, [hasSession, result.data, result.error, result.isPending, navigate, next]);

  const denied = result.data && !result.data.canOperate;

  return (
    <div className="mx-auto max-w-md space-y-8">
      <PageHeader
        eyebrow="Access"
        title={denied ? "Signing you in read only" : "Completing sign-in"}
        description={
          denied
            ? "Your identity is verified. This account is not on the operator allowlist yet, so actions stay locked."
            : "Validating your session and checking operator access."
        }
      />

      <GlassCard glow className="space-y-4 p-5">
        {hasSession === false ? (
          <>
            <p className="text-sm text-muted-foreground">
              No active session was found. Sign in again to continue.
            </p>
            <Button variant="outline" asChild>
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </>
        ) : null}

        {result.isPending && hasSession ? (
          <p className="text-sm text-muted-foreground">Checking your access.</p>
        ) : null}

        {result.error ? (
          <p className="text-sm text-destructive">{(result.error as Error).message}</p>
        ) : null}

        {denied ? (
          <>
            <p className="text-sm text-muted-foreground">
              Taking you to the Action Center in read-only mode. An administrator has to add your
              address to the operator allowlist before actions unlock.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link to="/">Continue now</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void supabase.auth.signOut().then(() => navigate({ to: "/auth" }));
                }}
              >
                Sign out
              </Button>
            </div>
          </>
        ) : null}

        {result.data?.canOperate ? (
          <p className="text-sm text-primary">
            Operator access confirmed. Taking you to the Action Center.
          </p>
        ) : null}
      </GlassCard>
    </div>
  );
}
