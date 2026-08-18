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

export function parseUuidInput(data: unknown): { id: string } {
  const input = readRecord(data);
  return { id: readUuid(input["id"]) };
}

export function parseChangeTransitionInput(data: unknown): {
  id: string;
  notes: string | null | undefined;
  revision: string | null | undefined;
} {
  const input = readRecord(data);
  return {
    id: readUuid(input["id"]),
    notes: readOptionalText(input["notes"], 2_000, "notes"),
    revision: readOptionalText(input["revision"], 200, "revision"),
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
