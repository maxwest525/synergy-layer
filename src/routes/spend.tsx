import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  CardGrid,
  EmptyState,
  MetricTile,
  PageHeader,
  PageStack,
  Section,
  TableShell,
  formatWhen,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { RoutePending } from "@/components/os/route-pending";
import { getProviderSpend } from "@/lib/operator-views.functions";

const spendQuery = {
  queryKey: ["provider-spend"],
  queryFn: () => getProviderSpend(),
};

export const Route = createFileRoute("/spend")({
  ssr: false,
  errorComponent: OperatorRouteError,
  pendingComponent: RoutePending,
  head: () => ({
    meta: [
      { title: "Data costs · Marky" },
      {
        name: "description",
        content:
          "Recorded provider requests, failures, and charges for every paid data source the OS calls, with the current monthly ceiling.",
      },
      { property: "og:title", content: "Data costs · Marky" },
      {
        property: "og:description",
        content: "What each paid data provider actually cost, from the stored request ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SpendPage,
});

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function SpendPage() {
  const { data } = useSuspenseQuery(spendQuery);
  const total = data.providers.reduce((sum, row) => sum + row.costUsd, 0);
  const requests = data.providers.reduce((sum, row) => sum + row.requests, 0);

  return (
    <PageStack>
      <PageHeader
        eyebrow="System"
        title="Data costs"
        description="What each outside data source has cost you. These are recorded charges, not estimates."
      />
      <CardGrid columns={3}>
        <MetricTile label="Charged so far" value={usd(total)} hint="Across all providers" />
        <MetricTile label="Requests" value={requests} hint="Every recorded request" />
        <MetricTile
          label="Monthly ceiling"
          value={data.budget ? usd(data.budget.ceilingUsd) : "Not set"}
          hint={
            data.budget
              ? `${usd(data.budget.spentUsd)} spent in ${data.budget.periodMonth}${
                  data.budget.hardStop ? ", hard stop on" : ""
                }`
              : "No budget record stored"
          }
        />
      </CardGrid>

      <Section title="By provider" hint="Requests, failures, and charges as recorded">
        {data.providers.every((row) => row.requests === 0) ? (
          <EmptyState
            title="No provider requests recorded"
            description="Spend appears here once a paid provider call is made and written to the ledger."
          />
        ) : (
          <TableShell>
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Requests</th>
                <th className="px-4 py-3 font-medium">Failures</th>
                <th className="px-4 py-3 font-medium">Charges</th>
                <th className="px-4 py-3 font-medium">Last request</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.map((row) => (
                <tr key={row.provider} className="border-b border-border/40 last:border-b-0">
                  <td className="px-4 py-3 text-foreground">{row.provider}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.requests}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.failures}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.provider.includes("SerpAPI")
                      ? `${data.serpApiCredits} credits`
                      : usd(row.costUsd)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatWhen(row.lastRequestAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>
    </PageStack>
  );
}
