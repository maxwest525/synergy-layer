import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

import { GlassCard, PageHeader } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/studio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Studio — AOOS" },
      {
        name: "description",
        content:
          "A private thinking surface where the operator explores marketing and SEO ideas with a reasoning agent before anything becomes a proposal.",
      },
      { property: "og:title", content: "Studio — AOOS" },
      {
        property: "og:description",
        content: "Explore ideas with the AOOS reasoning agent. Nothing here changes anything.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

function StudioPage() {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/studio-chat",
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Think out loud"
        title="Studio"
        description="A private surface for exploring ideas with a reasoning agent. It has no tools and touches no data, so nothing said here changes the platform. Anything worth doing becomes a proposal you approve in Decisions."
      />

      <GlassCard className="flex min-h-[420px] flex-col gap-4 p-5">
        <div className="flex-1 space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start anywhere. Ask about positioning, a keyword theme, a page idea, or how a workflow
              should be sequenced.
            </p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {message.role === "user" ? "You" : "Agent"}
                </p>
                {message.parts.map((part, index) =>
                  part.type === "reasoning" ? (
                    <p
                      key={index}
                      className="whitespace-pre-wrap border-l border-primary/30 pl-3 text-xs italic text-muted-foreground"
                    >
                      {part.text}
                    </p>
                  ) : part.type === "text" ? (
                    <p key={index} className="whitespace-pre-wrap text-sm text-foreground">
                      {part.text}
                    </p>
                  ) : null,
                )}
              </div>
            ))
          )}
          {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="What are you trying to figure out?"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={submit} disabled={busy}>
              {busy ? "Thinking" : "Send"}
            </Button>
            {busy ? (
              <Button variant="outline" size="sm" onClick={() => stop()}>
                Stop
              </Button>
            ) : null}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
