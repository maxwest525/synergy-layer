import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const transitionSource = readFileSync(
  fileURLToPath(new URL("../change-requests.functions.ts", import.meta.url)),
  "utf8",
);
const executionSource = readFileSync(
  fileURLToPath(new URL("../execution/execution.functions.ts", import.meta.url)),
  "utf8",
);

describe("SEO run change-transition wiring", () => {
  it("records the durable SEO timeline after every operator transition result", () => {
    expect(transitionSource).toContain('await import("./seo-runs/execution.server")');
    expect(transitionSource).toContain("await recordSeoRunChangeTransition(");
    expect(transitionSource).toContain("result.changeRequest.state");
  });

  it("records rendered proof after the public-page check succeeds", () => {
    expect(executionSource).toContain("await recordSeoRunRenderedProof(");
    expect(executionSource).toContain('result.status === "verified"');
    expect(executionSource).toContain("result.proof?.finalUrl");
  });
});
