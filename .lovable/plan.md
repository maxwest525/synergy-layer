# Ask composer, sidebar order, and the self-hosted stack

## 1. Sidebar order

Ask and Coverage are side surfaces, not stages of the daily loop, so they move
to the bottom. Nothing is removed or hidden.

```text
Today        decisions waiting on you (+ Suggestions, Page changes)
Evidence     stored facts (+ Search, Keywords, Competitors, Site health, ...)
Work         runs, schedules, SEO runs, tools, agents
Setup        connections, costs, people
Ask          the agent (+ Studio)
Coverage     the 54-task SEO framework map
```

## 2. New composer on Ask

Adopt the prompt box you pasted as `src/components/ui/ai-prompt-box.tsx`, with
these changes so it fits AOOS instead of fighting it:

- Every hardcoded hex (`#1F2023`, `#444444`, `#9b87f5`, the mode colours) is
  replaced with the existing semantic tokens, so it stays on the dark green
  cyber-luxury theme and does not turn purple.
- The injected `document.head` stylesheet is dropped. That breaks server
  rendering. Scrollbar styling goes into `src/styles.css`.
- Local duplicate `cn`, `Button`, `Textarea`, `Tooltip`, and `Dialog` copies are
  replaced with the project's existing ones.
- The three mode toggles are rewired to real behaviour instead of message
  prefixes:
  - Search: let the agent use web research
  - Think: reasoning mode
  - Canvas: dropped for now, nothing behind it
- Image attach and voice: attach stays (images are sent to the model). Voice is
  removed unless you want it, since nothing transcribes it today.

Then `src/components/os/agent-chat.tsx` swaps its plain textarea for this
composer, so Ask and Studio both get it, and the answer text gets real prose
styling (measured line length, spacing, headings, lists) so words flow instead
of arriving as one dense block.

## 3. Optional model

A small model control sits in the composer. Default stays
`google/gemini-3.1-pro-preview` and the label reads "Auto". You can override per
message; the choice is remembered locally and passed to `/api/agent-chat`, which
validates it against an allowlist server side so the browser cannot name an
arbitrary model.

## 4. Your self-hosted stack

n8n, SearXNG, Langflow, Umami, OpenSEO, Crawl4AI, Firecrawl, and AdLoop are all
real capability sources, and several already have half a seat in the registry.
That is its own body of work and it is governed by the documentation-first rule,
so it is not bundled into this UI change. What I would do next, in order:

1. Register all eight in the Capability Registry with an honest state, and a
   base URL plus a server-side secret each. None of them get called before a
   real authenticated read stores a snapshot.
2. Prove the cheap ones first: Umami (traffic, fills the GA4 hole), SearXNG
   (rank checks with no per-query cost), Crawl4AI and Firecrawl (page audits
   that feed Coverage and trust gaps).
3. Then the orchestrators: n8n as an execution target for approved changes,
   Langflow and AdLoop as capability providers behind existing workflows.

I need one thing from you before any of that: for each service, the base URL and
whether it is reachable from the internet or only on your VPS network. Self
hosted behind a firewall means this app cannot reach it and n8n has to call in
through a public API route instead.

## Technical detail

- `src/components/os/shell.tsx`: reorder `navSections`; also fix the reported
  `ChevronDown is not defined` runtime error in that file.
- New `src/components/ui/ai-prompt-box.tsx`, tokenised, SSR safe, built on the
  existing shadcn primitives.
- `bun add framer-motion` (dialog, tooltip, and lucide are already installed).
- `src/components/os/agent-chat.tsx`: use the new composer, add prose styling,
  pass the chosen model in the request body.
- `src/routes/api/agent-chat.ts`: accept an optional `model`, validated against
  an allowlist in `src/lib/ai/gateway.server.ts`.
- No database or business-logic changes in this pass.
