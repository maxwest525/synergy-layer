import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const functionsSource = readFileSync(
  fileURLToPath(new URL("./functions.ts", import.meta.url)),
  "utf8",
);

describe("SEO run list query", () => {
  it("loads only fields rendered or used by list actions", () => {
    const listHandler = functionsSource.slice(
      functionsSource.indexOf("export const getSeoRuns"),
      functionsSource.indexOf("export const getSeoRun ="),
    );

    expect(listHandler).toContain(
      '.select("id,target_url,query_class,created_at,state,change_request_id")',
    );
    expect(listHandler).not.toContain('.select("*")');
  });
});
