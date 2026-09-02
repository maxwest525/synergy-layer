import { describe, expect, it } from "vitest";

import { hasOperatorRole } from "./require-operator.server";

describe("a streaming route acts only for an operator", () => {
  it("recognises the two roles that may spend", () => {
    expect(hasOperatorRole([{ role: "admin" }])).toBe(true);
    expect(hasOperatorRole([{ role: "operator" }])).toBe(true);
    expect(hasOperatorRole([{ role: "viewer" }, { role: "operator" }])).toBe(true);
  });

  it("refuses a signed-in account with no role or only a viewer role", () => {
    expect(hasOperatorRole([])).toBe(false);
    expect(hasOperatorRole([{ role: "viewer" }])).toBe(false);
  });
});
