import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { EmptyState, GlassCard, PageHeader, StatePill } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { getExecutionManual } from "@/lib/knowledge/functions";

export const Route = createFileRoute("/knowledge/manual")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Execution Handbook — AOOS" },
      {
        name: "description",
        content: "The active, versioned AOOS Execution Handbook rendered from runtime knowledge.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExecutionManualPage,
});

function ExecutionManualPage() {
  const loadManual = useServerFn(getExecutionManual);
  const { data } = useSuspenseQuery({
    queryKey: ["execution-manual"],
    queryFn: () => loadManual(),
    retry: false,
  });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Governed operating manual"
        title="Execution Handbook"
        description="This view contains only active, tenant-scoped handbook versions and their embedded runtime chunks. GitHub files alone do not appear here."
        actions={
          <Button variant="outline" asChild>
            <Link to="/knowledge">Back to Knowledge</Link>
          </Button>
        }
      />

      {data.sources.length === 0 ? (
        <EmptyState
          title="No active handbook"
          description="The handbook files exist in GitHub but have not yet been ingested, embedded, and activated for this tenant."
        />
      ) : (
        <div className="space-y-5">
          {data.sources.map((source) => {
            const version = data.versions.find((item) => item.source_id === source.id);
            const chunks = version
              ? data.chunks.filter((chunk) => chunk.source_version_id === version.id)
              : [];
            return (
              <GlassCard key={source.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{source.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{source.source_ref}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatePill label={version?.version_label ?? "inactive"} tone="primary" />
                    <StatePill label={`${chunks.length} chunks`} />
                  </div>
                </div>
                <div className="mt-5 space-y-5">
                  {chunks.map((chunk) => (
                    <section
                      key={chunk.id}
                      className="border-t border-border/60 pt-4 first:border-0 first:pt-0"
                    >
                      <p className="text-xs font-medium text-primary">
                        {chunk.heading_path.join(" › ")}
                      </p>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                        {chunk.body}
                      </div>
                    </section>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
