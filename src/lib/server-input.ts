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
