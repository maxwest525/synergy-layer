import { describe, expect, it } from "vitest";

import { isIncomingRequestAbort } from "./http-request-errors";

function incomingAbort(): Error {
  const error = new Error("aborted");
  error.stack = [
    "Error: aborted",
    "    at abortIncoming (node:_http_server:838:17)",
    "    at socketOnClose (node:_http_server:832:3)",
  ].join("\n");
  return error;
}

describe("isIncomingRequestAbort", () => {
  it("recognizes the Node incoming-request disconnect", () => {
    expect(isIncomingRequestAbort(incomingAbort())).toBe(true);
  });

  it("recognizes a disconnect preserved as an error cause", () => {
    expect(isIncomingRequestAbort(new Error("request failed", { cause: incomingAbort() }))).toBe(
      true,
    );
  });

  it("does not hide an unrelated application error with the same message", () => {
    expect(isIncomingRequestAbort(new Error("aborted"))).toBe(false);
  });

  it("does not classify ordinary connection errors as incoming aborts", () => {
    const error = new Error("socket hang up");
    Object.assign(error, { code: "ECONNRESET" });
    expect(isIncomingRequestAbort(error)).toBe(false);
  });
});