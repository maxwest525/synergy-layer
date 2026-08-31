import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXECUTION_HANDBOOK_FILES, loadGovernedKnowledgeSources } from "./sources";

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

  /**
   * EXECUTION_HANDBOOK_FILES is an allowlist, not a glob. A file added to
   * docs/execution-handbook/ and left out of it is not governed knowledge: it
   * is never ingested, never embedded, and never retrieved, while looking to a
   * human exactly like the files that are. Nothing announces that.
   *
   * It has already happened once. COMPETITIVE_MODEL.md was written, linked from
   * the handbook index, and not ingested, which is a worse failure than a
   * missing file -- the doctrine deciding who counts as a competitor was
   * present for a reader and absent for every agent.
   *
   * So the directory is the assertion. Adding a handbook document now fails
   * here by name until it is either governed or explicitly refused.
   */
  it("governs every file in the handbook directory, with nothing listed that is not there", () => {
    const directory = fileURLToPath(new URL("../../../docs/execution-handbook/", import.meta.url));
    const onDisk = readdirSync(directory)
      .filter((entry) => entry.endsWith(".md"))
      .sort();

    expect(onDisk).toEqual([...EXECUTION_HANDBOOK_FILES].sort());
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
