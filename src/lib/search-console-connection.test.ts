import { describe, expect, it } from "vitest";

import {
  describeSearchConsoleConnection,
  readSearchConsoleCredentialPresence,
} from "./search-console-connection";

describe("Search Console connection facts", () => {
  it("keeps configuration, authentication proof, and successful reads separate", () => {
    const presence = readSearchConsoleCredentialPresence({
      LOVABLE_API_KEY: "present",
      GOOGLE_SEARCH_CONSOLE_API_KEY: "present",
    });
    expect(
      describeSearchConsoleConnection({
        presence,
        authenticatedAt: "2026-08-12T00:45:35Z",
        readSucceededAt: "2026-08-12T00:39:49Z",
        lastAttemptState: "failed",
        lastAttemptAt: "2026-08-13T16:05:02Z",
        lastAttemptError: "Search Console request failed [503]",
      }),
    ).toMatchObject({
      configured: true,
      authenticated: true,
      readSucceeded: true,
      lastAttemptState: "failed",
    });
  });

  it("requires both server-side connector secrets to call Google", () => {
    const facts = describeSearchConsoleConnection({
      presence: readSearchConsoleCredentialPresence({
        LOVABLE_API_KEY: "present",
      }),
      authenticatedAt: null,
      readSucceededAt: null,
    });
    expect(facts.configured).toBe(false);
    expect(facts.authenticated).toBe(false);
    expect(facts.readSucceeded).toBe(false);
  });
});
