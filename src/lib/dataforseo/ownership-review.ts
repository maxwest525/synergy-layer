/**
 * Words for the domain-ownership review. The two discovery rules file a
 * DECISION, never a finding: two domains sharing a registration detail or a
 * technology stack is a question for the operator, and nothing in AOOS asserts
 * a link on its own (COMPETITIVE_MODEL.md). This is the card's vocabulary.
 */

export const OWNERSHIP_REVIEW_DECISIONS = ["confirmed", "rejected"] as const;
export type OwnershipReviewDecision = (typeof OWNERSHIP_REVIEW_DECISIONS)[number];

export const OWNERSHIP_RULE_LABELS: Readonly<Record<string, string>> = {
  same_registration_details_across_two_known_domains: "Same registration details",
  identical_technology_stack_across_two_known_domains: "Identical technology stack",
};

export const OWNERSHIP_REVIEW_STATE_LABELS: Readonly<Record<string, string>> = {
  pending: "Waiting on your decision",
  confirmed: "Confirmed as one owner",
  rejected: "Rejected, separate owners",
};

const FIELD_WORDS: Readonly<Record<string, string>> = {
  registrar: "the same registrar",
  createdDatetime: "the same registration moment",
  expirationDatetime: "the same expiry moment",
};

/** One matched field, as a sentence fragment with its cohort stated. */
export function describeRegistrationMatch(match: unknown): string {
  if (!match || typeof match !== "object") return "a matched detail";
  const row = match as Record<string, unknown>;
  const field = typeof row["field"] === "string" ? row["field"] : "";
  const value = typeof row["value"] === "string" ? row["value"] : "";
  const words = FIELD_WORDS[field] ?? (field ? `the same ${field}` : "a matched detail");
  const cohort =
    typeof row["cohortCount"] === "number" && typeof row["cohortSize"] === "number"
      ? `, shared by ${row["cohortCount"]} of ${row["cohortSize"]} read domains`
      : "";
  return `${words}${value ? ` (${value})` : ""}${cohort}`;
}

/** Every matched field of a candidate, joined for one line. */
export function describeMatchedFields(matchedFields: unknown): string {
  if (!Array.isArray(matchedFields) || matchedFields.length === 0) return "no stored detail";
  return matchedFields.map(describeRegistrationMatch).join("; ");
}
