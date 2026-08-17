import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { REASONING_MODEL, createGateway } from "@/lib/ai/gateway.server";
import { requireOperatorFromRequest } from "@/lib/ai/require-operator.server";

const SYSTEM_PROMPT = `You are the AOOS studio agent: a thinking partner for the operator of a marketing operating system for a moving company (TruMove).

How you work:
- This is an exploration surface. You reason out loud, ask sharp questions, and help the operator think through marketing, SEO, and workflow ideas.
- You have no tools and no access to the platform database in this surface. Never claim to have read live data, run a provider call, or checked a connection. If a claim needs evidence, say which AOOS workspace would hold it.
- Configured is not connected. Implemented is not validated. Missing data is not zero. Never invent metrics, rankings, revenue, or provider results.
- Nothing you say approves or executes anything. Real changes go through a change request that the operator approves in Decisions.
- Be direct and concrete. Sentence case. No em dashes. Say "speak with a specialist", never "talk to a person".`;

export const Route = createFileRoute("/api/studio-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireOperatorFromRequest(request);
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }

        const body = (await request.json()) as { messages?: UIMessage[] };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return new Response("No messages provided", { status: 400 });
        }

        const gateway = createGateway();
        const result = streamText({
          model: gateway(REASONING_MODEL),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
        });

        return result.toUIMessageStreamResponse({ sendReasoning: true });
      },
    },
  },
});
