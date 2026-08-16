import { z } from "zod";

import { OPENAI_ADS_CAPI_SECRET_NAME } from "./config";
import { OPENAI_ADS_SUPPORTED_EVENTS, OPENAI_ADS_EVENT_CATALOG } from "./events";

export const validationInputSchema = z.object({
  eventName: z.string().min(1).max(120),
  eventId: z.string().min(1).max(200),
  transport: z.enum(["browser", "capi"]),
  sourcePath: z.string().max(500).optional(),
  oppref: z.string().max(500).optional(),
});

export type ValidationInput = z.infer<typeof validationInputSchema>;

export type ValidationCheck = {
  label: string;
  outcome: "pass" | "warn" | "fail";
  detail: string;
};

export type ValidationReport = {
  emitted: false;
  providerContacted: false;
  summary: string;
  checks: ValidationCheck[];
};

/**
 * Local, non-emitting validation. Nothing here calls a provider and nothing is
 * written, so a validation run can never create a production conversion. The
 * report says so explicitly rather than implying a provider accepted anything.
 */
export function validateCandidateEvent(
  input: ValidationInput,
  context: { existingTransports: readonly string[]; env: Record<string, string | undefined> },
): ValidationReport {
  const checks: ValidationCheck[] = [];

  const catalogEntry = OPENAI_ADS_EVENT_CATALOG.find((entry) => entry.name === input.eventName);
  if (!catalogEntry) {
    checks.push({
      label: "Event name",
      outcome: "fail",
      detail: `Not a supported event. Supported: ${OPENAI_ADS_SUPPORTED_EVENTS.join(", ")}.`,
    });
  } else if (catalogEntry.applicability === "not_applicable") {
    checks.push({
      label: "Event name",
      outcome: "fail",
      detail: `${catalogEntry.label} does not apply to this business. ${catalogEntry.boundaryEvidence}`,
    });
  } else {
    checks.push({
      label: "Event name",
      outcome: "pass",
      detail: `${catalogEntry.label} is supported for this business.`,
    });
    checks.push({
      label: "Success boundary",
      outcome: catalogEntry.boundaryEvidence ? "warn" : "pass",
      detail: catalogEntry.boundaryEvidence || catalogEntry.successBoundary,
    });
  }

  const duplicateSameTransport = context.existingTransports.includes(input.transport);
  const pairedOtherTransport = context.existingTransports.some(
    (transport) => transport !== input.transport,
  );
  checks.push({
    label: "Deduplication",
    outcome: duplicateSameTransport ? "fail" : "pass",
    detail: duplicateSameTransport
      ? "This event id already exists on the same path, so it would be rejected as a duplicate."
      : pairedOtherTransport
        ? "This event id exists on the other path, so the two would be matched as one deduplicated conversion."
        : "This event id is new. Reuse the same id on both paths for deduplication to be provable.",
  });

  checks.push({
    label: "Attribution reference",
    outcome: input.oppref?.trim() ? "pass" : "warn",
    detail: input.oppref?.trim()
      ? "An ad click reference is present, so this event could be attributed to a click."
      : "No ad click reference. The event would be stored, but nothing could attribute it to an ad click.",
  });

  checks.push({
    label: "Source path",
    outcome: input.sourcePath?.trim() ? "pass" : "warn",
    detail: input.sourcePath?.trim()
      ? "A source path is present."
      : "No source path. The event would be stored without page context.",
  });

  checks.push({
    label: "Provider validate-only call",
    outcome: "warn",
    detail: context.env[OPENAI_ADS_CAPI_SECRET_NAME]?.trim()
      ? "Skipped. The server-side credential is configured, but the provider validate-only contract has not been confirmed from authoritative documentation, so AOOS makes no call."
      : `Skipped. The ${OPENAI_ADS_CAPI_SECRET_NAME} secret is not configured and the provider validate-only contract is unconfirmed.`,
  });

  const failed = checks.filter((check) => check.outcome === "fail").length;
  return {
    emitted: false,
    providerContacted: false,
    summary:
      failed > 0
        ? `${failed} blocking problem${failed === 1 ? "" : "s"} found. Nothing was sent anywhere.`
        : "This payload would be accepted by the bridge. Nothing was sent anywhere.",
    checks,
  };
}
