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
import { listAuthorityFindings } from "@/lib/operator-views.functions";

const authorityQuery = {
  queryKey: ["authority-findings"],
  queryFn: () => listAuthorityFindings(),
};

export const Route = createFileRoute("/authority")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Authority findings — Marky" },
      {
        name: "description",
        content:
          "Observed authority and trust gaps per page, with the severity, confidence, and the evidence that is still missing before a change can be proposed.",
      },
      { property: "og:title", content: "Authority findings — Marky" },
      {
        property: "og:description",
        content: "Where pages fall short on authority signals, and what evidence is missing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthorityPage,
});

function severityTone(severity: string) {
  if (severity === "high" || severity === "critical") return "danger" as const;
  if (severity === "medium") return "warning" as const;
  return "neutral" as const;
}

function AuthorityPage() {
  const { data } = useSuspenseQuery(authorityQuery);
  const rows = data.findings;

  return (
    <PageStack>
      <PageHeader
        eyebrow="Evidence"
        title="Trust gaps"
        description="Pages missing the proof Google looks for, such as reviews, credentials, or named authorship. These are observations, not instructions."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No authority findings stored"
          description="Findings appear here after an authority evaluation runs against observed page evidence."
        />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Page</th>
              <th className="px-4 py-3 font-medium">Rule</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Missing evidence</th>
              <th className="px-4 py-3 font-medium">Detected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-b-0">
                <td className="px-4 py-3 text-foreground">{row.targetUrl ?? "Site wide"}</td>
                <td className="px-4 py-3">
                  <span className="text-foreground">{row.ruleKey.replace(/[._]/g, " ")}</span>
                  {row.queryClass ? (
                    <p className="text-xs text-muted-foreground">{row.queryClass}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <StatePill label={row.severity} tone={severityTone(row.severity)} />
                  {row.confidence ? (
                    <p className="text-xs text-muted-foreground">{row.confidence} confidence</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.missingEvidence.length ? row.missingEvidence.join(", ") : "None"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatWhen(row.detectedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </PageStack>
  );
}
