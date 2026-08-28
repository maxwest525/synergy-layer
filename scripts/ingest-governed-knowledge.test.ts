import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("governed knowledge ingestion CLI", () => {
  it("loads the committed source inventory in dry-run mode", () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)),
        fileURLToPath(new URL("./ingest-governed-knowledge.ts", import.meta.url)),
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    const output = result.stdout.slice(result.stdout.indexOf("{"));
    expect(JSON.parse(output)).toMatchObject({
      mode: "dry-run",
      sourceCount: 19,
      modelRequestCount: 19,
      // The handbook is the input, so editing any file in
      // docs/execution-handbook/ moves this number. Re-run the script and paste
      // the new total; a changed estimate here is the expected cost of a
      // documentation change, not a regression.
      estimatedInputTokens: 75_438,
    });
  });
});
