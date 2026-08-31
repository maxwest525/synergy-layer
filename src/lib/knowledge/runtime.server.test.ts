import { describe, expect, it, vi } from "vitest";

import {
  ingestKnowledgeVersionWithStore,
  pgVectorLiteral,
  type KnowledgeRuntimeStore,
} from "./runtime.server";

const embedding = Array.from({ length: 768 }, () => 0.01);

function fakeStore(existing: { id: string; status: string } | null = null) {
  const calls: {
    versions: unknown[];
    chunks: unknown[];
    statuses: unknown[];
    activations: unknown[];
  } = {
    versions: [],
    chunks: [],
    statuses: [],
    activations: [],
  };
  const store: KnowledgeRuntimeStore = {
    async upsertSource() {
      return { id: "source-1" };
    },
    async findVersion() {
      return existing;
    },
    async countChunks() {
      return existing ? 4 : 0;
    },
    async insertVersion(input) {
      calls.versions.push(input);
      return { id: "version-1" };
    },
    async insertChunks(rows) {
      calls.chunks.push(...rows);
    },
    async markVersion(_id, status) {
      calls.statuses.push(status);
    },
    async activate(_tenantId, versionId) {
      calls.activations.push(versionId);
    },
  };
  return { store, calls };
}

describe("governed knowledge ingestion", () => {
  it("chunks, embeds, marks embedded, and activates an immutable version", async () => {
    const { store, calls } = fakeStore();
    const embedder = vi.fn(async ({ documents }: { documents: unknown[] }) =>
      documents.map(() => embedding),
    );
    const result = await ingestKnowledgeVersionWithStore(
      store,
      {} as never,
      "tenant-1",
      {
        stableKey: "playbook.authority-science",
        title: "Authority Science",
        sourceType: "playbook",
        sourceRef: "attachment://authority-science",
        versionLabel: "2026-08-13",
        content:
          "# Authority Science\n\nAuthority is capacity.\n\n## Ranking\n\nRanking is observed.",
      },
      { apiKey: "secret", embedder, activate: true },
    );

    expect(result).toMatchObject({ reused: false, versionId: "version-1", active: true });
    expect(embedder).toHaveBeenCalledOnce();
    expect(calls.chunks).toHaveLength(result.chunkCount);
    expect(calls.statuses).toEqual(["embedded"]);
    expect(calls.activations).toEqual(["version-1"]);
    expect(calls.chunks[0]).toMatchObject({ embedding: expect.stringMatching(/^\[/) });
  });

  it("reuses an existing checksum without embedding or writing", async () => {
    const { store, calls } = fakeStore({ id: "existing-version", status: "active" });
    const embedder = vi.fn();
    const result = await ingestKnowledgeVersionWithStore(
      store,
      {} as never,
      "tenant-1",
      {
        stableKey: "manual.source-of-truth",
        title: "Source of Truth",
        sourceType: "execution_handbook",
        sourceRef: "docs/execution-handbook/SOURCE_OF_TRUTH.md",
        versionLabel: "git-sha",
        content: "# Source of Truth\n\nRules.",
      },
      { apiKey: "secret", embedder, activate: true },
    );

    expect(result).toEqual({
      reused: true,
      sourceId: "source-1",
      versionId: "existing-version",
      chunkCount: 4,
      active: true,
    });
    expect(embedder).not.toHaveBeenCalled();
    expect(calls.versions).toEqual([]);
  });

  it("serializes only valid 768-dimensional vectors", () => {
    expect(pgVectorLiteral(embedding)).toMatch(/^\[0\.01,/);
    expect(() => pgVectorLiteral([1, 2, 3])).toThrow("768");
  });
});
