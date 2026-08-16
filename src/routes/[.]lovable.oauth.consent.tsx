import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { GlassCard, PageHeader } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
};

function oauthApi(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser only: the Supabase client reads its session from localStorage.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Authorize access — AOOS" },
      {
        name: "description",
        content: "Approve or deny an agent client requesting access to your AOOS account.",
      },
      { property: "og:title", content: "Authorize access — AOOS" },
      {
        property: "og:description",
        content: "Approve or deny an agent client requesting access to AOOS.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id:
      typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
    return undefined;
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md space-y-8">
      <PageHeader
        eyebrow="Access"
        title="Authorization request failed"
        description={String((error as Error)?.message ?? error)}
      />
    </div>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "this client";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: decisionError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect was returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <PageHeader
        eyebrow="Access"
        title={`Connect ${clientName} to AOOS`}
        description="Approving lets this agent client read AOOS as you. Your role and access rules still apply."
      />

      <GlassCard glow className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          {clientName} is requesting read access to your inbox, recommendations, workflow runs,
          capabilities, and assets. It cannot approve work or run anything on your behalf.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button variant="outline" disabled={busy} onClick={() => void decide(true)}>
            {busy ? "Working" : "Approve"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
            Deny
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
