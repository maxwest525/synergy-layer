// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    router: {
      // The route HMR adapter mutates shared route exports in place. Under the
      // preview's repeated SSR module reloads that can leave two index routes in
      // one tree. A full route-module reload is slower only while editing and
      // keeps every request's tree deterministic.
      codeSplittingOptions: { addHmr: false },
    },
  },
  vite: {
    // mcp-js 0.26 compares a POSIX repository path with a Windows-resolved
    // routes path and aborts before Vite can build. Lovable builds on Linux,
    // where the plugin remains enabled; local Windows checks skip only it.
    plugins: process.platform === "win32" ? [] : [mcpPlugin()],
  },
});
