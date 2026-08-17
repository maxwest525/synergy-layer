import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useState } from "react";

import { GlassCard } from "@/components/os/primitives";
import { PromptInputBox, type PromptMode } from "@/components/ui/ai-prompt-box";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENT_MODEL_CHOICES, type AgentModelChoice } from "@/lib/ai/models";
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

const MODEL_STORAGE_KEY = "aoos.agent.model";

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
        <pre className="scrollbar-none mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[0.7rem] text-muted-foreground">
          {JSON.stringify(part.output ?? part.input ?? {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * Answers arrive as plain text. Splitting on blank lines and rendering simple
 * bullets is enough to make them read like prose instead of one dense block,
 * without pulling a markdown renderer into the bundle.
 */
function AnswerText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim().length > 0);
  return (
    <div className="max-w-[68ch] space-y-3 text-[0.95rem] leading-7 text-foreground">
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const bulleted = lines.every((line) => /^\s*([-*•]|\d+[.)])\s+/.test(line));
        if (bulleted) {
          return (
            <ul key={index} className="list-disc space-y-1.5 pl-5 marker:text-primary/70">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{line.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}

/**
 * The one conversation surface in the OS. Every screen that talks to the agent
 * renders this, so tool activity, citations, and the proposal-only rule look
 * the same everywhere.
 */
export function AgentChat({ api, placeholder, emptyHint, suggestions, className }: AgentChatProps) {
  const [model, setModel] = useState<AgentModelChoice>("auto");

  useEffect(() => {
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored && AGENT_MODEL_CHOICES.some((choice) => choice.id === stored)) {
      setModel(stored as AgentModelChoice);
    }
  }, []);

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

  const send = (text: string, mode: PromptMode = null) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed }, { body: { model, mode } });
  };

  return (
    <GlassCard className={cn("flex min-h-[520px] flex-col gap-4 p-5", className)}>
      <div className="flex-1 space-y-6">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">{emptyHint}</p>
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
                      className="max-w-[68ch] whitespace-pre-wrap border-l border-primary/30 pl-3 text-xs italic leading-6 text-muted-foreground"
                    >
                      {part.text}
                    </p>
                  );
                }
                if (part.type === "text") {
                  return <AnswerText key={index} text={part.text} />;
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
        <PromptInputBox
          placeholder={placeholder}
          isLoading={busy}
          onStop={() => stop()}
          onSend={(text, options) => send(text, options.mode)}
          trailing={
            <Select
              value={model}
              onValueChange={(value) => {
                setModel(value as AgentModelChoice);
                window.localStorage.setItem(MODEL_STORAGE_KEY, value);
              }}
            >
              <SelectTrigger
                aria-label="Model"
                className="h-8 w-[8.5rem] rounded-full border-border/70 bg-transparent text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_MODEL_CHOICES.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id} className="text-xs">
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <p className="text-xs text-muted-foreground">
          The agent reads evidence and drafts proposals. It never changes anything on its own.
        </p>
      </div>
    </GlassCard>
  );
}
