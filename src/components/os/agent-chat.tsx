import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

import { GlassCard } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type AgentChatProps = {
  /** Streaming endpoint. Use /api/agent-chat for the tool-backed agent. */
  api: string;
  placeholder: string;
  emptyHint: string;
  suggestions?: readonly string[];
  className?: string;
};

type ToolPart = { type: string; state?: string; input?: unknown; output?: unknown };

function ToolActivity({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const done = part.state === "output-available";
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="font-medium text-foreground/90">
          {done ? "Read" : "Reading"} {name}
        </span>
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[0.7rem] text-muted-foreground">
          {JSON.stringify(part.output ?? part.input ?? {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * The one conversation surface in the OS. Every screen that talks to the agent
 * renders this, so tool activity, citations, and the proposal-only rule look
 * the same everywhere.
 */
export function AgentChat({ api, placeholder, emptyHint, suggestions, className }: AgentChatProps) {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api,
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [api],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    void sendMessage({ text: trimmed });
  };

  return (
    <GlassCard className={cn("flex min-h-[520px] flex-col gap-4 p-5", className)}>
      <div className="flex-1 space-y-5">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{emptyHint}</p>
            {suggestions?.length ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {message.role === "user" ? "You" : "Agent"}
              </p>
              {message.parts.map((part, index) => {
                if (part.type === "reasoning") {
                  return (
                    <p
                      key={index}
                      className="whitespace-pre-wrap border-l border-primary/30 pl-3 text-xs italic text-muted-foreground"
                    >
                      {part.text}
                    </p>
                  );
                }
                if (part.type === "text") {
                  return (
                    <p key={index} className="whitespace-pre-wrap text-sm text-foreground">
                      {part.text}
                    </p>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  return <ToolActivity key={index} part={part as ToolPart} />;
                }
                return null;
              })}
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
              send(input);
            }
          }}
          placeholder={placeholder}
          rows={3}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => send(input)} disabled={busy}>
            {busy ? "Working" : "Send"}
          </Button>
          {busy ? (
            <Button variant="outline" size="sm" onClick={() => stop()}>
              Stop
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The agent reads evidence and drafts proposals. It never changes anything on its own.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
