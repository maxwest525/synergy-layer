import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));

describe("Lovable preview auth runtime compatibility", () => {
  it.each(["integrations/supabase/auth-middleware.ts", "lib/tenant.server.ts"])(
    "reads the authorization header without the unavailable getRequest export in %s",
    (file) => {
      const source = readFileSync(`${sourceRoot}/${file}`, "utf8");

      expect(source).toContain("getRequestHeader");
      if (file === "lib/tenant.server.ts") {
        expect(source).toContain('from "@tanstack/start-server-core"');
      }
      expect(source).not.toMatch(/\bgetRequest\s*\(/);
    },
  );

  it("uses one shared shell session instead of competing getSession requests", () => {
    const hook = readFileSync(`${sourceRoot}/hooks/use-operator-session.ts`, "utf8");
    const middleware = readFileSync(`${sourceRoot}/lib/server-function-auth.ts`, "utf8");
    const start = readFileSync(`${sourceRoot}/start.ts`, "utf8");
    // The shell the root actually renders. This read named `shell.tsx` until
    // 2026-08-29, which stopped being rendered on 2026-08-20 -- so the
    // assertion below passed against a file no operator could reach, and
    // would have kept passing if the live shell regressed.
    const shell = readFileSync(`${sourceRoot}/components/os/app-shell.tsx`, "utf8");
    const switcher = readFileSync(`${sourceRoot}/components/os/tenant-switcher.tsx`, "utf8");

    expect(hook).not.toContain("auth.getSession(");
    expect(middleware).not.toContain("auth.getSession(");
    expect(start).toContain("functionMiddleware: [attachStoredAuth]");
    expect(shell).toContain("<TenantSwitcher session={session}");
    expect(switcher).not.toContain("useOperatorSession");
  });
});
