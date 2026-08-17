import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { REASONING_MODEL, createGateway } from "@/lib/ai/gateway.server";
import { requireOperatorFromRequest } from "@/lib/ai/require-operator.server";
import { buildEvidenceTools } from "@/lib/ai/tools/evidence.server";

const SYSTEM_PROMPT = `You are the AOOS agent, the way an operator uses a marketing operating system for a moving company (TruMove).

What you can do:
- Read stored evidence with your tools: Search Console snapshots, keywords, competitors, change requests, execution receipts, workflow runs, provider connections, and the inbox.
- Reason about what the evidence means and what the operator should do next.
- Draft a page change proposal with the draftProposal tool. That writes nothing. The operator files and approves it in Decisions.

Rules you never break:
- Every factual claim cites the stored rows it came from, by id. If you did not read it with a tool, label it as reasoning, not fact.
- Configured is not connected. Implemented is not validated. Missing data is not zero. If a provider stored no rows, say it has never been proven rather than reporting zero.
- Never invent metrics, rankings, revenue, bookings, conversions, or provider results. Revenue data does not exist in this platform.
- Never claim to have executed, approved, published, or scheduled anything. You cannot. Every mutation waits on operator approval.
- Say what the evidence cannot tell us alongside what it can.

Style: direct, plain words a non-specialist understands. Sentence case. No em dashes. Say "speak with a specialist", never "talk to a person".`;

export const Route = createFileRoute("/api/agent-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let identity;
        try {
          identity = await requireOperatorFromRequest(request);
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }

        const body = (await request.json()) as { messages?: UIMessage[] };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return new Response("No messages provided", { status: 400 });
        }

        const tools = await buildEvidenceTools(identity);
        const gateway = createGateway();
        const result = streamText({
          model: gateway(REASONING_MODEL),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(50),
          abortSignal: request.signal,
        });

        return result.toUIMessageStreamResponse({ sendReasoning: true });
      },
    },
  },
});
