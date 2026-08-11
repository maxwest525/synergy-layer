import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { DetailRow, EmptyState, GlassCard, PageHeader, StatePill } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvailabilityBadge } from "@/components/os/availability-badge";
import { getTenantContext } from "@/lib/tenant.functions";
import { getToolSystem } from "@/lib/tool-estate.functions";
import {
  COST_LABELS,
  CREDENTIAL_LABELS,
  INSTALLED_LABELS,
  KIND_LABELS,
  MODE_LABELS,
  VERIFICATION_LABELS,
} from "@/lib/tool-estate-display";

export const Route = createFileRoute("/capabilities/systems/$key")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "System detail — AOOS tool estate" },
      {
        name: "description",
        content:
          "One canonical system: its operations, what each one can change, its cost, and whether AOOS can call it today.",
      },
      { property: "og:title", content: "System detail — AOOS tool estate" },
      {
        property: "og:description",
        content: "Operations with read, draft, and write modes, plus current AOOS availability.",
      },
    ],
  }),
  component: SystemDetailPage,
});

const MODE_TONES: Record<string, "neutral" | "warning" | "danger"> = {
  read: "neutral",
  draft: "warning",
  write: "danger",
  admin: "danger",
  internal: "neutral",
};

function SystemDetailPage() {
  const { key } = Route.useParams();
  const loadTenantContext = useServerFn(getTenantContext);
  const loadSystem = useServerFn(getToolSystem);

  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data.activeTenantId;

  const { data } = useSuspenseQuery({
    queryKey: ["tool-system", activeTenantId, key],
    queryFn: () => loadSystem({ data: { key } }),
    retry: false,
  });

  const [search, setSearch] = useState("");
  const operations = data.operations;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return operations;
    return operations.filter(
      (operation) =>
        operation.operation_key.toLowerCase().includes(needle) ||
        operation.display_name.toLowerCase().includes(needle),
    );
  }, [operations, search]);

  if (!data.system) {
    return <EmptyState title="System not found" description="That system is not in this workspace inventory." />;
  }

  const system = data.system;
  const writeGated = operations.some((operation) => operation.operation_mode === "write");
  const metadata = (system.metadata ?? {}) as Record<string, unknown>;
  const safety = metadata["safety"] as Record<string, unknown> | undefined;
  const requiresDryRun = Boolean(safety?.["require_dry_run"]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={KIND_LABELS[system.kind] ?? system.kind}
        title={system.name}
        description={system.summary ?? "No summary recorded."}
        actions={
          <Button variant="outline" asChild>
            <Link to="/capabilities/systems">Back to systems</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">What is true today</h2>
          <div className="mt-2">
            <AvailabilityBadge system={system} />
          </div>
          <dl className="mt-3">
            <DetailRow label="Install" value={INSTALLED_LABELS[system.installed_state] ?? system.installed_state} />
            <DetailRow
              label="Credentials"
              value={CREDENTIAL_LABELS[system.credential_state] ?? system.credential_state}
            />
            <DetailRow
              label="Live proof"
              value={VERIFICATION_LABELS[system.verification_state] ?? system.verification_state}
            />
            <DetailRow
              label="Callable from AOOS"
              value={system.aoos_connection_state === "callable" ? "Yes" : "No bridge yet"}
            />
            <DetailRow label="Operations catalogued" value={operations.length} />
          </dl>
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Provenance</h2>
          <dl className="mt-3">
            <DetailRow label="Stable key" value={system.stable_key} />
            <DetailRow label="Provider" value={system.provider ?? "Not set"} />
            <DetailRow label="Version" value={system.version ?? "Not set"} />
            <DetailRow label="Runs" value={system.execution_location} />
            <DetailRow label="Discovered from" value={system.discovered_from ?? "Not set"} />
            <DetailRow label="Source reference" value={system.source_reference ?? "Not set"} />
            <DetailRow label="Last verified" value={system.last_verified_at ?? "Never"} />
          </dl>
        </GlassCard>
      </div>

      {writeGated || requiresDryRun ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Safety gate</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every external change is planned first. Draft operations only prepare a plan, and nothing outside
            AOOS changes until the single write operation is run. That write operation defaults to a dry run,
            and the local install requires a dry run before anything is applied.
          </p>
        </GlassCard>
      ) : null}

      {data.aliases.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Duplicate registrations ({data.aliases.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            These are the same system registered more than once. They are kept as evidence, not counted as
            separate systems.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {data.aliases.map((alias) => (
              <GlassCard key={alias.id} className="p-3">
                <p className="text-sm font-medium text-foreground">{alias.alias_label}</p>
                <p className="text-xs text-muted-foreground">
                  {alias.registered_in ?? "Registration source not set"}
                </p>
                {alias.note ? <p className="mt-1 text-xs text-muted-foreground">{alias.note}</p> : null}
              </GlassCard>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Operations ({operations.length})</h2>
        {operations.length === 0 ? (
          <EmptyState
            title="No operations catalogued"
            description="The provider surface has been counted, but individual operations are not imported yet."
          />
        ) : (
          <>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search operations"
              aria-label="Search operations"
              className="max-w-md"
            />
            <div className="space-y-2">
              {visible.map((operation) => (
                <GlassCard key={operation.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{operation.display_name}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatePill
                        label={MODE_LABELS[operation.operation_mode] ?? operation.operation_mode}
                        tone={MODE_TONES[operation.operation_mode] ?? "neutral"}
                      />
                      {operation.operation_mode === "write" ? (
                        <StatePill label="Write gated" tone="danger" />
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {COST_LABELS[operation.cost_model] ?? operation.cost_model}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {system.aoos_connection_state === "callable"
                          ? "Available in AOOS"
                          : "Not available in AOOS"}
                      </span>
                    </div>
                  </div>
                  {operation.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{operation.notes}</p>
                  ) : null}
                </GlassCard>
              ))}
              {visible.length === 0 ? (
                <EmptyState title="No operations match" description="Clear the search to see the full list." />
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
