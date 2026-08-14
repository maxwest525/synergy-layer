type ObservationInput = {
  metadata?: unknown;
  [key: string]: unknown;
};

export function observationRecommendationRecord<T extends ObservationInput>(
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
