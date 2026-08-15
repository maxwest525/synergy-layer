import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Lovable knowledge server-function compiler contract", () => {
  it("does not make the server-function compiler resolve zod", () => {
    const source = readFileSync(fileURLToPath(new URL("./functions.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/from ["']zod["']/);
  });

  it("still accepts only the explicit 18-request approval", async () => {
    const functions = (await import("./functions")) as unknown as Record<string, unknown>;
    const validate = functions["validateKnowledgeIngestionApproval"];
    expect(validate).toBeTypeOf("function");
    expect((validate as (value: unknown) => unknown)({ approvedModelRequests: 18 })).toEqual({
      approvedModelRequests: 18,
    });
    expect(() => (validate as (value: unknown) => unknown)({ approvedModelRequests: 17 })).toThrow(
      "exactly 18",
    );
  });
});
