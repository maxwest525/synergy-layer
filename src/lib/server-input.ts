const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRecord(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Input must be an object.");
  }
  return data as Record<string, unknown>;
}

function readUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error("id must be a valid UUID.");
  }
  return value;
}

function readOptionalText(value: unknown, max: number, label: string): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  if (value.length > max) {
    throw new Error(`${label} must be no more than ${max.toLocaleString("en-US")} characters.`);
  }
  return value;
}

const NEXT_ACTION_TEXT_FIELDS = [
  "id",
  "group",
  "title",
  "reason",
  "evidence",
  "actionLabel",
] as const;

/**
 * The next-best-actions the operator's screen already computed, sent back for
 * an optional model re-ranking. The model may only reorder ids it was given,
 * so the input is bounded and every field is checked for shape and size
 * before it reaches a prompt; anything else is refused rather than trimmed.
 */
export function parsePrioritizeActionsInput(data: unknown): {
  actions: import("./next-actions").NextAction[];
} {
  const input = readRecord(data);
  const raw = input["actions"];
  if (!Array.isArray(raw)) throw new Error("actions must be a list.");
  if (raw.length > 50) throw new Error("actions must hold no more than 50 items.");
  const actions = raw.map((item, index) => {
    const row = readRecord(item);
    for (const field of NEXT_ACTION_TEXT_FIELDS) {
      const value = row[field];
      if (typeof value !== "string" || value.length === 0 || value.length > 2_000) {
        throw new Error(`actions[${index}].${field} must be text of at most 2,000 characters.`);
      }
    }
    if (row["blockedBy"] !== null && typeof row["blockedBy"] !== "string") {
      throw new Error(`actions[${index}].blockedBy must be text or null.`);
    }
    if (typeof row["weight"] !== "number" || !Number.isFinite(row["weight"])) {
      throw new Error(`actions[${index}].weight must be a number.`);
    }
    if (typeof row["to"] !== "object" || row["to"] === null) {
      throw new Error(`actions[${index}].to must be a route.`);
    }
    return row as unknown as import("./next-actions").NextAction;
  });
  return { actions };
}

export function parseUuidInput(data: unknown): { id: string } {
  const input = readRecord(data);
  return { id: readUuid(input["id"]) };
}

function readOptionalFlag(value: unknown, label: string): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  return value;
}

export function parseChangeTransitionInput(data: unknown): {
  id: string;
  notes: string | null | undefined;
  revision: string | null | undefined;
  /** Set only by the "approve anyway" control when another change to the page is in flight. */
  acknowledgeInFlight: boolean | undefined;
} {
  const input = readRecord(data);
  return {
    id: readUuid(input["id"]),
    notes: readOptionalText(input["notes"], 2_000, "notes"),
    revision: readOptionalText(input["revision"], 200, "revision"),
    acknowledgeInFlight: readOptionalFlag(input["acknowledgeInFlight"], "acknowledgeInFlight"),
  };
}

export type BulkChangeDecisionItem = {
  id: string;
  notes: string | null | undefined;
};

export function parseBulkChangeDecisionInput(data: unknown): {
  decision: "approve" | "reject";
  items: BulkChangeDecisionItem[];
} {
  const input = readRecord(data);
  const decision = input["decision"];
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("decision must be approve or reject.");
  }
  const rawItems = input["items"];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Select at least one suggestion.");
  }
  if (rawItems.length > 50) {
    throw new Error("Decide no more than 50 suggestions at a time.");
  }
  const seen = new Set<string>();
  const items = rawItems.map((entry) => {
    const record = readRecord(entry);
    const id = readUuid(record["id"]);
    if (seen.has(id)) throw new Error("The same suggestion was selected twice.");
    seen.add(id);
    return { id, notes: readOptionalText(record["notes"], 2_000, "notes") };
  });
  return { decision, items };
}
