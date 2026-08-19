import { createFileRoute } from "@tanstack/react-router";

import { AgentChat } from "@/components/os/agent-chat";
import { PageHeader } from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/studio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Studio — Marky" },
      {
        name: "description",
        content:
          "A private thinking surface where the operator explores marketing and SEO ideas with a reasoning agent before anything becomes a proposal.",
      },
      { property: "og:title", content: "Studio — Marky" },
      {
        property: "og:description",
        content: "Explore ideas with the AOOS reasoning agent. Nothing here changes anything.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: StudioPage,
});

function StudioPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Think out loud"
        title="Studio"
        description="A private surface for exploring ideas. This agent has no tools and reads no data, so it can only reason with you. When you want answers grounded in stored evidence, use Ask."
      />
      <AgentChat
        api="/api/studio-chat"
        placeholder="What are you trying to figure out?"
        emptyHint="Start anywhere. Positioning, a keyword theme, a page idea, or how a workflow should be sequenced."
      />
    </div>
  );
}
