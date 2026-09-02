import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { retrieveGovernedKnowledge } from "../knowledge/runtime.server";
import { evaluateAuthorityRules } from "./rules";
import type { AuthorityEvidenceInput, AuthorityFinding, AuthorityQueryClass } from "./types";

type Client = SupabaseClient<Database>;

export function normalizeTargetUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractObservedRanks(
  rawTargetUrl: string,
  snapshots: { rows?: unknown }[],
): number[] {
  const targetUrl = normalizeTargetUrl(rawTargetUrl);
  const ranks: number[] = [];
  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot.rows)) continue;
    for (const rawRow of snapshot.rows) {
      const row = record(rawRow);
      if (!row) continue;
      const page = row["page"] ?? row["url"];
      if (typeof page !== "string") continue;
      try {
        if (normalizeTargetUrl(page) !== targetUrl) continue;
      } catch {
        continue;
      }
      const rank = row["average_position"] ?? row["position"];
      if (typeof rank === "number" && Number.isFinite(rank) && rank > 0) ranks.push(rank);
    }
  }
  return ranks;
}

export function authorityFindingFingerprint(finding: AuthorityFinding): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ruleKey: finding.ruleKey,
        targetUrl: finding.targetUrl,
        queryClass: finding.queryClass,
        observed: finding.observed,
        missingEvidence: finding.missingEvidence,
        permittedActions: finding.permittedActions,
        knowledgeChunkIds: finding.knowledgeChunkIds,
      }),
      "utf8",
    )
    .digest("hex");
}

export async function persistAuthorityFindings(
  admin: Client,
  tenantId: string,
  findings: AuthorityFinding[],
) {
  const persisted = [];
  for (const finding of findings) {
    const fingerprint = authorityFindingFingerprint(finding);
    const { data: existing, error: existingError } = await admin
      .from("authority_findings")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("target_url", finding.targetUrl)
      .eq("rule_key", finding.ruleKey)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let findingId = existing?.id;
    if (!findingId) {
      const { data, error } = await admin
        .from("authority_findings")
        .insert({
          tenant_id: tenantId,
          target_url: finding.targetUrl,
          rule_key: finding.ruleKey,
          query_class: finding.queryClass,
          severity: finding.severity,
          confidence: finding.confidence,
          observed: finding.observed as Json,
          missing_evidence: finding.missingEvidence,
          knowledge_chunk_ids: finding.knowledgeChunkIds,
          fingerprint,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      findingId = data.id;

      const evidencePayload = JSON.stringify(finding.observed);
      const { error: evidenceError } = await admin.from("authority_finding_evidence").insert({
        tenant_id: tenantId,
        finding_id: findingId,
        source_kind: "authority_evaluation_input",
        source_ref: finding.targetUrl,
        observed_at: new Date().toISOString(),
        payload: finding.observed as Json,
        content_sha256: createHash("sha256").update(evidencePayload, "utf8").digest("hex"),
      });
      if (evidenceError) throw new Error(evidenceError.message);
    }

    const { error: actionError } = await admin.from("authority_actions").upsert(
      finding.permittedActions.map((authorityAction) => ({
        tenant_id: tenantId,
        finding_id: findingId!,
        action_key: authorityAction.actionKey,
        label: authorityAction.label,
        rationale: authorityAction.rationale,
        requires_exact_change: authorityAction.requiresExactChange,
      })),
      { onConflict: "tenant_id,finding_id,action_key", ignoreDuplicates: true },
    );
    if (actionError) throw new Error(actionError.message);
    persisted.push({ id: findingId, fingerprint, reused: Boolean(existing) });
  }
  return persisted;
}

function payloadRows(value: Json): unknown[] {
  const payload = record(value);
  return payload && Array.isArray(payload["rows"]) ? payload["rows"] : [];
}

export async function evaluateAuthorityForTarget(
  client: Client,
  tenantId: string,
  rawTargetUrl: string,
  queryClass: AuthorityQueryClass,
) {
  const targetUrl = normalizeTargetUrl(rawTargetUrl);
  const [{ data: snapshots, error: snapshotError }, { data: activeVersions, error: versionError }] =
    await Promise.all([
      client
        .from("search_console_snapshots")
        .select("payload,collected_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "page_query")
        .order("collected_at", { ascending: false })
        .limit(60),
      client
        .from("knowledge_source_versions")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .limit(1),
    ]);
  if (snapshotError) throw new Error(snapshotError.message);
  if (versionError) throw new Error(versionError.message);

  const observedRanks = extractObservedRanks(
    targetUrl,
    (snapshots ?? []).map((snapshot) => ({ rows: payloadRows(snapshot.payload) })),
  );
  const knowledge = activeVersions?.length
    ? await retrieveGovernedKnowledge(client, `Authority Science ${queryClass} ${targetUrl}`, {
        limit: 8,
      })
    : [];
  const evidence: AuthorityEvidenceInput = {
    targetUrl,
    queryClass,
    observedRanks,
    knowledgeChunkIds: knowledge.map((chunk) => chunk.id),
  };
  const findings = evaluateAuthorityRules(evidence);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const persisted = await persistAuthorityFindings(supabaseAdmin, tenantId, findings);
  return { evidence, findings, persisted };
}
