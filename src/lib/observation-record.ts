type ObservationInput = {
  metadata?: unknown;
};

/**
 * `const` type parameter keeps literal unions (risk, impact levels) narrow so
 * the database column types still accept the record.
 */
export function observationRecommendationRecord<const T extends ObservationInput>(
  record: T,
): T & {
  state: "observed";
  requires_approval: false;
  metadata: Record<string, unknown>;
} {
  const metadata =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};

  return {
    ...record,
    state: "observed",
    requires_approval: false,
    metadata: { ...metadata, observationOnly: true },
  };
}
