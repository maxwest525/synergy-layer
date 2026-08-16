import { describe, expect, it } from "vitest";

import { parseOpenSeoInvocation } from "./functions";

describe("OpenSEO invocation input", () => {
  it("rejects an empty tool name before a server call can begin", () => {
    expect(() =>
      parseOpenSeoInvocation({ toolName: " ", arguments: {}, confirmed: false }),
    ).toThrow();
  });

  it("rejects non-object tool arguments before a server call can begin", () => {
    expect(() =>
      parseOpenSeoInvocation({
        toolName: "whoami",
        arguments: ["not-an-object"],
        confirmed: false,
      }),
    ).toThrow();
  });

  it("rejects an invocation that omits explicit confirmation state", () => {
    expect(() => parseOpenSeoInvocation({ toolName: "whoami", arguments: {} })).toThrow();
  });
});
