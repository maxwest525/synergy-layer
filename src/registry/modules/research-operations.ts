import type { ModuleDefinition } from "../types";

/**
 * Research operations. cap.web_research is backed by two linked connectors:
 * Perplexity for grounded search and Firecrawl for reading the cited sources.
 * Read-only: it never mutates anything outside the AOOS knowledge layer.
 */
export const definition: ModuleDefinition = {
  module: "research-operations",
  capabilities: [
    {
      key: "cap.web_research",
      name: "Web Research",
      kind: "api",
      category: "Research",
      description:
        "Grounded web research through Perplexity, with Firecrawl reading the cited sources. Results are filed as knowledge entries in the Research collection.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        { name: "search.grounded", description: "Run a grounded Perplexity search with citations." },
        { name: "source.scrape", description: "Read a cited source page through Firecrawl." },
        { name: "knowledge.file", description: "File the briefing and sources into kb.research." },
      ],
      config: {
        providers: ["perplexity", "firecrawl"],
        readOnly: true,
        collection: "kb.research",
        maxSourcesPerRun: 3,
      },
    },
  ],
};
