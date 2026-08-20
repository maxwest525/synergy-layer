import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Node stays the default: the great majority of tests are pure logic and a
    // DOM would only slow them down. A test that needs a browser opts in with
    // `// @vitest-environment jsdom` at the top of the file, and gets the
    // cleanup and matchers from `vitest.setup.ts`.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // A git worktree of this repo lives under `.claude/worktrees/`, so without
    // this every suite is collected twice and the reported count is double the
    // real one.
    exclude: ["**/node_modules/**", "**/dist/**", ".output/**", ".claude/**"],
    testTimeout: 15_000,
  },
});
