/**
 * Test setup, shared by every suite.
 *
 * The node-environment suites, which are most of them, get nothing from this
 * file but the cost of importing it. The jsdom suites, which opt in per file
 * with `// @vitest-environment jsdom`, get `@testing-library/jest-dom`'s
 * matchers and an unmount between tests so one test's DOM never leaks into the
 * next one's queries.
 */

import { afterEach } from "vitest";

const hasDom = typeof globalThis.document !== "undefined";

if (hasDom) {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
