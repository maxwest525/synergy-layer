import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { OperatorRouteError } from "@/components/os/route-error";
import {
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvailabilityBadge } from "@/components/os/availability-badge";
import { getTenantContext } from "@/lib/tenant.functions";
import { getToolEstate } from "@/lib/tool-estate.functions";
import { KIND_LABELS, type EstateFilter } from "@/lib/tool-estate-display";
import { checkConnectorReadiness, getConnectorReadiness } from "@/lib/connectors/functions";

export const Route = createFileRoute("/capabilities/systems/")({
  // Operator-only surface: rendering it on the server without the operator
  // bearer token produces an empty tree the client immediately replaces.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Systems & operations — AOOS" },
      {
        name: "description",
        content:
          "The real installed tool estate: canonical systems, their operations, and whether each one is actually callable from AOOS.",
      },
      { property: "og:title", content: "Systems & operations — AOOS" },
      {
        property: "og:description",
        content:
          "Discovered, installed, credentialed, live proven, and callable are independent facts.",
      },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: SystemsPage,
});

type View = "essentials" | "all";

const FILTERS: { key: EstateFilter; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every canonical system in this view." },
  {
    key: "available",
    label: "Available to enable",
    hint: "The provider exists and could be turned on.",
  },
  { key: "enabled", label: "Enabled", hint: "Confirmed switched on for this workspace." },
  {
    key: "credentialed",
    label: "Credentialed",
    hint: "Configuration metadata observed. No values are stored.",
  },
  { key: "implemented", label: "Implemented", hint: "AOOS code exists for it, fully or partly." },
  { key: "callable", label: "Callable from AOOS", hint: "AOOS cloud can call it today." },
  {
    key: "installed",
    label: "Installed locally",
    hint: "Present on the local workstation or workspace.",
  },
  { key: "live", label: "Live proven", hint: "Observed actually working, fully or partly." },
];

type ReadinessInput = {
  installed_state: string;
  credential_state: string;
  verification_state: string;
  aoos_connection_state: string;
  available_state: string;
  enabled_state: string;
  implemented_state: string;
};

function matches(system: ReadinessInput, filter: EstateFilter): boolean {
  switch (filter) {
    case "available":
      return system.available_state === "available_to_enable";
    case "enabled":
      return system.enabled_state === "enabled";
    case "credentialed":
      return system.credential_state === "configured";
    case "implemented":
      return (
        system.implemented_state === "implemented" ||
        system.implemented_state === "partially_implemented"
      );
    case "callable":
      return system.aoos_connection_state === "callable";
    case "installed":
      return system.installed_state === "installed";
    case "live":
      return (
        system.verification_state === "live_proven" ||
        system.verification_state === "partially_live_proven"
      );
    default:
      return true;
  }
}

function SystemsPage() {
  const loadTenantContext = useServerFn(getTenantContext);
  const loadEstate = useServerFn(getToolEstate);
  const loadConnections = useServerFn(getConnectorReadiness);
  const checkConnections = useServerFn(checkConnectorReadiness);
  const queryClient = useQueryClient();

  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data.activeTenantId;

  const { data } = useSuspenseQuery({
    queryKey: ["tool-estate", activeTenantId],
    queryFn: () => loadEstate(),
    retry: false,
  });

  const connectorLedger = useSuspenseQuery({
    queryKey: ["connector-readiness", activeTenantId],
    queryFn: () => loadConnections(),
    retry: false,
  });
  const check = useMutation({
    mutationFn: () => checkConnections(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["connector-readiness"] });
      toast.success(
        `Checked ${result.checkedCount} connectors; ${result.healthyCount} returned healthy proof.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [view, setView] = useState<View>("essentials");
  const [filter, setFilter] = useState<EstateFilter>("all");
  const [search, setSearch] = useState("");

  // Every number on this page is recalculated from what the database returned.
  const scoped = useMemo(
    () =>
      view === "essentials" ? data.systems.filter((system) => system.is_essential) : data.systems,
    [data.systems, view],
  );

  const scopedOperations = useMemo(
    () => scoped.reduce((total, system) => total + system.operationCount, 0),
    [scoped],
  );
  const scopedAliases = useMemo(
    () => scoped.reduce((total, system) => total + system.aliasCount, 0),
    [scoped],
  );

  const counts = useMemo(() => {
    const base: Record<EstateFilter, number> = {
      all: scoped.length,
      available: 0,
      enabled: 0,
      credentialed: 0,
      implemented: 0,
      callable: 0,
      installed: 0,
      live: 0,
    };
    for (const system of scoped) {
      for (const item of FILTERS) {
        if (item.key !== "all" && matches(system, item.key))
          base[item.key] = (base[item.key] ?? 0) + 1;
      }
    }
    return base;
  }, [scoped]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scoped.filter((system) => {
      if (!matches(system, filter)) return false;
      if (!needle) return true;
      return (
        system.name.toLowerCase().includes(needle) ||
        system.stable_key.toLowerCase().includes(needle) ||
        (system.provider ?? "").toLowerCase().includes(needle)
      );
    });
  }, [scoped, filter, search]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tool estate"
        title="Systems & operations"
        description="Available to enable, enabled, credentialed, implemented, and callable from AOOS are separate facts. A system existing on a workstation, or a credential existing for it, does not make it callable from AOOS."
        actions={
          <Button variant="outline" asChild>
            <Link to="/capabilities">Back to capabilities</Link>
          </Button>
        }
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Runtime connector ledger</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Secrets stay server-side. Configured means the required environment names are present;
              healthy requires a dated, bounded probe. Providers without a safe free probe remain
              degraded until real operational evidence exists.
            </p>
          </div>
          <Button disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check connections"}
          </Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connectorLedger.data.connections.map((connection) => {
            const health = connection.persisted?.health ?? connection.health;
            const outcome =
              connection.persisted?.config &&
              typeof connection.persisted.config === "object" &&
              !Array.isArray(connection.persisted.config)
                ? String(connection.persisted.config["probe_outcome"] ?? "not checked")
                : "not checked";
            return (
              <div key={connection.key} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{connection.label}</p>
                    <p className="text-xs text-muted-foreground">{connection.provider}</p>
                  </div>
                  <StatePill
                    label={health}
                    {...(health === "healthy"
                      ? { tone: "success" }
                      : health === "failing"
                        ? { tone: "danger" }
                        : {})}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {connection.state} · {outcome.replaceAll("_", " ")}
                </p>
                {connection.missing.length ? (
                  <p className="mt-1 text-xs text-destructive">
                    Missing: {connection.missing.join(", ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </GlassCard>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "essentials", label: "Essentials" },
            { key: "all", label: "All systems" },
          ] as { key: View; label: string }[]
        ).map((tab) => (
          <Button
            key={tab.key}
            variant="outline"
            size="sm"
            onClick={() => {
              setView(tab.key);
              setFilter("all");
            }}
            className={view === tab.key ? "border-primary/60 text-primary" : undefined}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          label={view === "essentials" ? "Essential systems" : "Canonical systems"}
          value={scoped.length}
          hint="Duplicate registrations are folded into aliases."
        />
        <MetricTile
          label="Catalogued operations"
          value={scopedOperations}
          hint="Individual calls these systems expose today."
        />
        <MetricTile
          label="Aliases & registrations"
          value={scopedAliases}
          hint="Other names for these systems, including included services and duplicate registrations."
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item.key}
              variant="outline"
              size="sm"
              title={item.hint}
              onClick={() => setFilter(item.key)}
              className={filter === item.key ? "border-primary/60 text-primary" : undefined}
            >
              {item.label} · {counts[item.key]}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search systems by name, key, or provider"
          aria-label="Search systems"
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          {view === "essentials"
            ? "The foundational systems this operation runs on. Switch to All systems for the full catalog."
            : "The full catalog after duplicates are folded in and excluded systems are removed."}{" "}
          {FILTERS.find((item) => item.key === filter)?.hint}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No systems match"
          description="Clear the search or choose a different filter."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((system) => (
            <Link
              key={system.id}
              to="/capabilities/systems/$key"
              params={{ key: system.stable_key }}
              className="block"
            >
              <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{system.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {KIND_LABELS[system.kind] ?? system.kind}
                      {system.version ? ` · ${system.version}` : ""}
                    </p>
                  </div>
                  <AvailabilityBadge system={system} />
                </div>
                {system.summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {system.summary}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{system.operationCount} operations</span>
                  {system.aliasCount > 0 ? <span>{system.aliasCount} aliases</span> : null}
                  <span>Runs {system.execution_location}</span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
