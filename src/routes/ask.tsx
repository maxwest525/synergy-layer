import { createFileRoute } from "@tanstack/react-router";

import { AgentChat } from "@/components/os/agent-chat";
import { PageHeader } from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/ask")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ask the agent — AOOS" },
      {
        name: "description",
        content:
          "Ask the AOOS agent anything about stored marketing evidence. It reads Search Console, keywords, competitors, change requests, and runs, cites the rows it used, and drafts proposals you approve.",
      },
      { property: "og:title", content: "Ask the agent — AOOS" },
      {
        property: "og:description",
        content: "One place to ask what the evidence says and what to do next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: AskPage,
});

const SUGGESTIONS = [
  "What is waiting on me right now?",
  "Which pages are losing the most impressions?",
  "Which providers are actually proven, and which are only configured?",
  "Draft a title change for the page with the worst click through rate",
] as const;

function AskPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="The main way to use AOOS"
        title="Ask"
        description="Ask in plain words. The agent reads the stored evidence with tools, shows every read it made, and cites the rows behind each claim. Anything it wants to change comes back as a draft you approve."
      />
      <AgentChat
        api="/api/agent-chat"
        placeholder="Ask what the evidence says, or what to do next"
        emptyHint="Ask about search performance, keywords, competitors, page changes, runs, or provider health. Every answer names the rows it came from."
        suggestions={SUGGESTIONS}
      />
    </div>
  );
}
