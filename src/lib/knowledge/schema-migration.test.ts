import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20260814150000_governed_knowledge_runtime.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("governed knowledge database contract", () => {
  it("enables vectors and creates versioned tenant-scoped sources and chunks", () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.knowledge_sources/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.knowledge_source_versions/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.knowledge_chunks/i);
    expect(sql).toMatch(/embedding extensions\.vector\(768\)/i);
    expect(sql.match(/tenant_id uuid NOT NULL REFERENCES public\.tenants/g)?.length).toBe(3);
  });

  it("enforces immutable versions and one active version per source", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS knowledge_one_active_version[\s\S]*WHERE status = 'active'/i,
    );
    expect(sql).toMatch(/CREATE TRIGGER protect_knowledge_version_content/i);
    expect(sql).toMatch(/CREATE TRIGGER protect_active_knowledge_chunks/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.activate_knowledge_version/i);
  });

  it("exposes tenant-scoped active-only hybrid retrieval", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.match_knowledge_chunks/i);
    expect(sql).toMatch(/v\.status = 'active'/i);
    expect(sql).toMatch(/c\.tenant_id = _tenant_id/i);
    expect(sql).toMatch(/1 - \(c\.embedding <=> _query_embedding\)/i);
    expect(sql).toMatch(/websearch_to_tsquery\('english', _query_text\)/i);
  });

  it("applies RLS and explicit grants to every governed table", () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(3);
    expect(sql.match(/FOR SELECT TO authenticated/g)?.length).toBe(3);
    expect(sql).toMatch(/GRANT SELECT ON public\.knowledge_sources TO authenticated/i);
    expect(sql).toMatch(/GRANT ALL ON public\.knowledge_chunks TO service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.match_knowledge_chunks/i);
  });
});
