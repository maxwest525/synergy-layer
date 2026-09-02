import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  EmptyState,
  PageHeader,
  PageStack,
  StatePill,
  TableShell,
  formatWhen,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { listAuthorizedOperators } from "@/lib/operator-views.functions";

const operatorsQuery = {
  queryKey: ["authorized-operators"],
  queryFn: () => listAuthorizedOperators(),
};

export const Route = createFileRoute("/operators")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Authorized operators · Marky" },
      {
        name: "description",
        content:
          "Everyone authorized on the active workspace, the role each one holds, and when their access was granted.",
      },
      { property: "og:title", content: "Authorized operators · Marky" },
      {
        property: "og:description",
        content: "Who can approve and execute work in this workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperatorsPage,
});

function OperatorsPage() {
  const { data } = useSuspenseQuery(operatorsQuery);
  const rows = data.operators;

  return (
    <PageStack>
      <PageHeader
        eyebrow="System"
        title="People"
        description="Who can sign in to this workspace and what each person is allowed to decide. Approval authority lives with people here, never with an agent."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No members visible"
          description="Membership records for this workspace are not readable with your current access."
        />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Access since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-border/40 last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">
                    {row.displayName ?? row.email ?? "Unnamed operator"}
                  </p>
                  {row.email && row.displayName ? (
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <StatePill label={row.role} tone={row.role === "owner" ? "primary" : "neutral"} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatWhen(row.since)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </PageStack>
  );
}
