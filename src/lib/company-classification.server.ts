import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { logActivity } from "./os.server";

export const COMPANY_CLASSIFICATIONS = [
  "carrier",
  "broker",
  "lead_vendor",
  "publisher_directory",
  "other",
  "unclassified",
] as const;

export type CompanyClassification = (typeof COMPANY_CLASSIFICATIONS)[number];

export const COMPANY_CLASSIFICATION_LABELS: Record<CompanyClassification, string> = {
  carrier: "Carrier",
  broker: "Broker",
  lead_vendor: "Lead vendor",
  publisher_directory: "Publisher / Directory",
  other: "Other",
  unclassified: "Unknown / unclassified",
};

type SetCompanyClassificationInput = {
  client: SupabaseClient<Database>;
  tenantId: string;
  actorId: string;
  candidateId: string;
  classification: CompanyClassification;
  at?: Date;
};

/**
 * Records an operator's business classification separately from the SERP-derived
 * domain class. A ranking rival is never promoted to a business classification
 * by inference.
 */
export async function setCompanyClassification(input: SetCompanyClassificationInput) {
  const { data: candidate, error: candidateError } = await input.client
    .from("competitor_candidates")
    .select("id, domain, company_classification")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.candidateId)
    .maybeSingle();
  if (candidateError) throw new Error(candidateError.message);
  if (!candidate) throw new Error("Company record was not found for the active workspace.");

  const classification = input.classification === "unclassified" ? null : input.classification;
  if (candidate.company_classification === classification) {
    return { changed: false, domain: candidate.domain, classification };
  }

  const changedAt = (input.at ?? new Date()).toISOString();
  const { error: updateError } = await input.client
    .from("competitor_candidates")
    .update({
      company_classification: classification,
      classification_updated_by: input.actorId,
      classification_updated_at: changedAt,
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.candidateId);
  if (updateError) throw new Error(updateError.message);

  await logActivity(input.client, {
    tenantId: input.tenantId,
    actorKind: "user",
    actorId: input.actorId,
    verb: "company.classification_changed",
    subjectKind: "competitor_candidate",
    subjectId: candidate.id,
    summary: `Operator classified ${candidate.domain} as ${classification ?? "unknown/unclassified"}.`,
    payload: {
      domain: candidate.domain,
      previous: candidate.company_classification,
      classification,
    },
  });

  return { changed: true, domain: candidate.domain, classification };
}
