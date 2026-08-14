import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeWritingGuidance } from "./title-h1-proposals";

type Client = SupabaseClient<Database>;

function searchTerms(targetUrl: string, queries: string[]): string[] {
  const pathTerms = new URL(targetUrl).pathname
    .split(/[\/-]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 3);
  return [...new Set([...pathTerms, ...queries.flatMap((query) => query.toLowerCase().split(/\s+/))])]
    .filter((value) => value.length >= 3)
    .slice(0, 30);
}

function excerpt(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length <= 600 ? compact : `${compact.slice(0, 597)}...`;
}

export async function retrieveKnowledgeGuidance(
  client: Client,
  tenantId: string,
  input: { targetUrl: string; queries: string[] },
): Promise<KnowledgeWritingGuidance[]> {
  const { data, error } = await client
    .from("knowledge_entries")
    .select("id, title, body, source_ref, tags, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .not("body", "is", null)
    .order("updated_at", { ascending: false })
    .limit(40);

  // Knowledge is optional writing guidance. An unavailable or empty collection
  // must never prevent a proposal whose three evidence classes are complete.
  if (error || !data) return [];

  const terms = searchTerms(input.targetUrl, input.queries);
  return data
    .map((row) => {
      const haystack = [row.title, row.body ?? "", ...(row.tags ?? [])].join(" ").toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { row, score };
    })
    .filter(({ row, score }) => Boolean(row.body) && (score > 0 || terms.length === 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ row }) => ({
      id: row.id,
      title: row.title,
      excerpt: excerpt(row.body ?? ""),
      sourceRef: row.source_ref,
    }));
}
