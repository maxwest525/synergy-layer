import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageAuditPanel } from "@/components/os/page-audit-panel";
import {
  EmptyState,
  GlassCard,
  PageHeader,
  PageStack,
  StatePill,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SitePage } from "@/lib/site-pages.functions";
import { listSitePages } from "@/lib/site-pages.functions";
import { proposeAuditFix } from "@/lib/audit-proposals.functions";

export const Route = createFileRoute("/pages/tools")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Site pages — Marky" },
      {
        name: "description",
        content:
          "Every page Google reported for the connected property, with clicks, impressions and position, a live preview, and a one click title and H1 edit proposal.",
      },
      { property: "og:title", content: "Site pages — Marky" },
      {
        property: "og:description",
        content: "Page inventory, live preview, and on page edits in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SitePagesRoute,
});

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function pos(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function SitePagesRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listSitePages);
  const propose = useServerFn(proposeAuditFix);

  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const pagesQuery = useQuery({
    queryKey: ["site-pages"],
    queryFn: () => list({ data: undefined }),
  });

  const proposeMutation = useMutation({
    mutationFn: (targetUrl: string) =>
      propose({ data: { scope: "page", targetUrl, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: (result) => {
      toast.success("Edit proposed. Review it before anything is published.");
      void queryClient.invalidateQueries({ queryKey: ["site-pages"] });
      void navigate({ to: "/changes/$id", params: { id: result.changeRequest.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = pagesQuery.data;
  const pages = useMemo(() => {
    const all = data?.pages ?? [];
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((page) => page.url.toLowerCase().includes(needle)) : all;
  }, [data, filter]);

  const preview = selected ?? pages[0]?.url ?? null;

  return (
    <PageStack>
      <PageHeader
        eyebrow="Evidence"
        title="Site pages"
        description={
          data?.property
            ? `Every page Google reported for ${data.property}${data.latestDate ? ` on ${data.latestDate}` : ""}. Pick one to preview it and propose its on page edit.`
            : "Every page Google reported for the connected property."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void pagesQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <GlassCard className="p-4 text-sm text-muted-foreground">
        {data?.instruction ?? "Loading the page list..."}
      </GlassCard>

      <PageAuditPanel />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <GlassCard className="space-y-3 p-5">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter pages by URL"
          />
          {pagesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Reading stored page rows...</p>
          ) : pages.length === 0 ? (
            <EmptyState
              title="No pages to show"
              description="Run the Search Console observation, then come back to pick a page to work on."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Page</th>
                    <th className="py-2 pr-3 text-right">Clicks</th>
                    <th className="py-2 pr-3 text-right">Impressions</th>
                    <th className="py-2 pr-3 text-right">CTR</th>
                    <th className="py-2 pr-3 text-right">Position</th>
                    <th className="py-2 pr-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <PageRow
                      key={page.url}
                      page={page}
                      active={page.url === preview}
                      busy={proposeMutation.isPending}
                      onSelect={() => setSelected(page.url)}
                      onPropose={() => proposeMutation.mutate(page.url)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Live preview</h2>
            {preview ? (
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open page <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {preview ? (
            <>
              <p className="break-all text-xs text-muted-foreground">{preview}</p>
              <iframe
                key={preview}
                src={preview}
                title="Live page preview"
                className="h-[520px] w-full rounded-xl border border-border/60 bg-background"
                loading="lazy"
                sandbox="allow-same-origin allow-scripts allow-popups"
              />
              <p className="text-xs text-muted-foreground">
                This is the live page as visitors see it. If it stays blank, the site blocks
                embedding, so use Open page instead.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a page to preview it here.</p>
          )}
        </GlassCard>
      </div>
    </PageStack>
  );
}

function PageRow({
  page,
  active,
  busy,
  onSelect,
  onPropose,
}: {
  page: SitePage;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onPropose: () => void;
}) {
  return (
    <tr
      className={`cursor-pointer border-t border-border/40 ${active ? "bg-primary/5" : ""}`}
      onClick={onSelect}
    >
      <td className="max-w-[280px] truncate py-2 pr-3 text-foreground" title={page.url}>
        {page.url}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{page.clicks}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{page.impressions}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{pct(page.ctr)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{pos(page.position)}</td>
      <td className="py-2 pr-3" onClick={(event) => event.stopPropagation()}>
        {page.changeId ? (
          <Link
            to="/changes/$id"
            params={{ id: page.changeId }}
            className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
          >
            Review edit <StatePill tone="neutral" label={page.changeState ?? "open"} />
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={onPropose}>
            Propose edit
          </Button>
        )}
      </td>
    </tr>
  );
}
