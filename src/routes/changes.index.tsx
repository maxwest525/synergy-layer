import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  EmptyState,
  PageHeader,
  PageStack,
  StatePill,
  TableShell,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { listChangeRequests } from "@/lib/operator-views.functions";

const changesQuery = {
  queryKey: ["change-requests"],
  queryFn: () => listChangeRequests(),
};

export const Route = createFileRoute("/changes/")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Change requests — AOOS" },
      {
        name: "description",
        content:
          "Every proposed page change with its exact lifecycle state, from proposed through approved, applied, verified, or rolled back.",
      },
      { property: "og:title", content: "Change requests — AOOS" },
      {
        property: "og:description",
        content: "The full queue of proposed page changes and where each one stands.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChangeRequestsPage,
});

function ChangeRequestsPage() {
  const { data } = useSuspenseQuery(changesQuery);
  const rows = data.changeRequests;

  return (
    <PageStack>
      <PageHeader
        eyebrow="Decide"
        title="Change requests"
        description="Concrete proposed page changes and the exact state of each one. Nothing here changes a live page until an operator approves it."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No change requests yet"
          description="Proposed page changes appear here once evidence supports a concrete edit."
        />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Change</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-b-0">
                <td className="px-4 py-3">
                  <Link
                    to="/changes/$id"
                    params={{ id: row.id }}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {row.title}
                  </Link>
                  {row.proposalType ? (
                    <p className="text-xs text-muted-foreground">{row.proposalType}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.targetUrl ?? "Not set"}</td>
                <td className="px-4 py-3">
                  <StatePill label={row.state} tone={toneForState(row.state)} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatWhen(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </PageStack>
  );
}
