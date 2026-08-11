import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { EmptyState, GlassCard, MetricTile, PageHeader, StatePill } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTenantContext } from "@/lib/tenant.functions";
import { getToolEstate } from "@/lib/tool-estate.functions";
import {
  availabilityLabel,
  availabilityTone,
  KIND_LABELS,
  type EstateFilter,
} from "@/lib/tool-estate-display";

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
        content: "Discovered, installed, credentialed, live proven, and callable are independent facts.",
      },
    ],
  }),
  component: SystemsPage,
});

const FILTERS: { key: EstateFilter; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every canonical system in the inventory." },
  { key: "discovered", label: "Discovered", hint: "Seen during discovery, install not confirmed." },
  { key: "installed", label: "Installed", hint: "Present on the local workstation or workspace." },
  { key: "credentialed", label: "Credentialed", hint: "Configuration metadata observed. No values are stored." },
  { key: "live", label: "Live proven", hint: "Observed actually working, fully or partly." },
  { key: "callable", label: "Callable from AOOS", hint: "AOOS cloud can call it today." },
];

function matches(
  system: { installed_state: string; credential_state: string; verification_state: string; aoos_connection_state: string },
  filter: EstateFilter,
): boolean {
  switch (filter) {
    case "discovered":
      return system.installed_state === "discovered";
    case "installed":
      return system.installed_state === "installed";
    case "credentialed":
      return system.credential_state === "configured";
    case "live":
      return system.verification_state === "live_proven" || system.verification_state === "partially_live_proven";
    case "callable":
      return system.aoos_connection_state === "callable";
    default:
      return true;
  }
}

function SystemsPage() {
  const loadTenantContext = useServerFn(getTenantContext);
  const loadEstate = useServerFn(getToolEstate);

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

  const [filter, setFilter] = useState<EstateFilter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const base: Record<EstateFilter, number> = {
      all: data.systems.length,
      discovered: 0,
      installed: 0,
      credentialed: 0,
      live: 0,
      callable: 0,
    };
    for (const system of data.systems) {
      for (const item of FILTERS) {
        if (item.key !== "all" && matches(system, item.key)) base[item.key] += 1;
      }
    }
    return base;
  }, [data.systems]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.systems.filter((system) => {
      if (!matches(system, filter)) return false;
      if (!needle) return true;
      return (
        system.name.toLowerCase().includes(needle) ||
        system.stable_key.toLowerCase().includes(needle) ||
        (system.provider ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data.systems, filter, search]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tool estate"
        title="Systems & operations"
        description="A frozen discovery snapshot from August 11, 2026. Discovered, installed, credentialed, live proven, and callable from AOOS are five independent facts. A system existing on a workstation does not make it callable from AOOS."
        actions={
          <Button variant="outline" asChild>
            <Link to="/capabilities">Back to capabilities</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile label="Canonical systems" value={data.systems.length} hint="Duplicate registrations are folded into aliases." />
        <MetricTile label="Catalogued operations" value={data.operationCount} hint="Individual calls the local systems expose." />
        <MetricTile label="Duplicate registrations" value={data.aliasCount} hint="Aliases pointing at one canonical system." />
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
        <p className="text-xs text-muted-foreground">{FILTERS.find((item) => item.key === filter)?.hint}</p>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No systems match" description="Clear the search or choose a different filter." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((system) => (
            <Link
              key={system.id}
              to="/capabilities/systems/$key"
              params={{ key: system.stable_key }}
              className="block"
            >
              <GlassCard className="h-full p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{system.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {KIND_LABELS[system.kind] ?? system.kind}
                      {system.version ? ` · ${system.version}` : ""}
                    </p>
                  </div>
                  <StatePill label={availabilityLabel(system)} tone={availabilityTone(system)} />
                </div>
                {system.summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{system.summary}</p>
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
