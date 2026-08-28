import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadGovernedKnowledgeSources } from "./sources";

describe("governed production source manifest", () => {
  it("does not resolve the repository URL while the bundled server module initializes", () => {
    const source = readFileSync(fileURLToPath(new URL("./sources.ts", import.meta.url)), "utf8");

    expect(source).not.toMatch(/const REPO_ROOT\s*=\s*fileURLToPath\(new URL/);
  });

  it("loads exactly the two supplied playbooks and all 17 handbook documents", () => {
    const sources = loadGovernedKnowledgeSources();
    const playbooks = sources.filter((source) => source.sourceType === "playbook");
    const handbook = sources.filter((source) => source.sourceType === "execution_handbook");

    expect(sources).toHaveLength(19);
    expect(playbooks.map((source) => source.stableKey)).toEqual([
      "playbook.seo-aeo-laws",
      "playbook.dataforseo-master",
    ]);
    expect(handbook).toHaveLength(17);
    expect(handbook.map((source) => source.sourceRef)).toContain(
      "docs/execution-handbook/SOURCE_OF_TRUTH.md",
    );
    expect(handbook.map((source) => source.sourceRef)).toContain(
      "docs/execution-handbook/KNOWLEDGE_INGESTION.md",
    );
    // Doctrine an agent has to reason with, not just a file a human can open:
    // the competitive model decides who counts as a competitor and what is out
    // of scope, so it has to reach the runtime the same way the rest does.
    expect(handbook.map((source) => source.sourceRef)).toContain(
      "docs/execution-handbook/COMPETITIVE_MODEL.md",
    );
  });

  it("loads the same source inventory from the production bundle", () => {
    const filesystemSources = loadGovernedKnowledgeSources();
    const bundledSources = loadGovernedKnowledgeSources({ bundled: true });

    expect(bundledSources.map((source) => source.contentSha256)).toEqual(
      filesystemSources.map((source) => source.contentSha256),
    );
  });

  it("proves the Authority Science source and immutable source checksums", () => {
    const sources = loadGovernedKnowledgeSources();
    const authority = sources.find((source) => source.stableKey === "playbook.seo-aeo-laws")!;

    expect(authority.content).toContain("Authority Science — The Governing Definition");
    expect(authority.content).toContain("Authority is the conditional capacity");
    expect(authority.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sources.every((source) => source.sourceSizeBytes > 0)).toBe(true);
    expect(new Set(sources.map((source) => source.contentSha256)).size).toBe(sources.length);
  });
});
