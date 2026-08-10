# Make navigation between workspaces fast

## What I measured

Every workspace page currently costs a full server round trip before anything renders. Timing the running app:

```text
/                1899 ms
/command-center  1657 ms
/assets          1450 ms
/agents          1479 ms
/workflows       1544 ms
```

Confirmed causes, from reading the code and the live network traffic:

1. **Every route blocks on its loader.** Each route does `ensureQueryData(...)` in the loader, so clicking a nav link shows the old page frozen until the server answers. Nothing renders early, and there is no pending UI.
2. **No preloading.** `src/router.tsx` sets `defaultPreloadStaleTime: 0` but never sets `defaultPreload`, so hovering a link fetches nothing ahead of time.
3. **Nothing is cached between visits.** No `staleTime` anywhere, so going Inbox to Assets and back re-runs the identical server call every time.
4. **Each server call pays a tenant tax before it queries anything.** Every read builds a fresh backend client, then runs up to three extra sequential lookups (`profiles`, `tenant_members`, `tenants`) just to work out which client workspace applies. That is 1 to 3 extra round trips in front of the real query, on every single request. The existing cache is keyed to the throwaway client, so it never survives a request.
5. **The Command Center fires 20+ separate count queries** in `fetchOverview`, which is why it is the heaviest page.
6. **A hydration mismatch on the Agents route** forces React to throw away the server-rendered tree and re-render the whole page on the client, which reads as a visible stall.

## What I will change

**Routing and caching (biggest win, no backend changes)**
- Set `defaultPreload: "intent"` with a short delay in `src/router.tsx`, and give queries a sane `staleTime` (about 30 seconds) plus a longer `gcTime` so revisits are instant and refresh in the background.
- Stop loaders from blocking: kick off the fetch in the loader without awaiting it, and let each page's suspense query render with a lightweight skeleton. Pages become interactive immediately instead of freezing on the old screen.
- Add a small pending component so a slow page shows structure rather than nothing.

**Cut the per-request tenant tax**
- Cache the resolved tenant per request (and briefly per operator token) instead of per throwaway client, so the `profiles` / `tenant_members` / `tenants` lookups run once rather than in front of every read.
- Reuse a single backend client per request instead of constructing a new one for each call.

**Command Center**
- Collapse the 20+ sequential count queries into a single grouped read so the heaviest page stops being a fan-out of round trips.

**Correctness fix that shows up as slowness**
- Fix the Agents route hydration mismatch so the page is not re-rendered from scratch after load.

## Out of scope

No schema changes, no new tables, no visual redesign, no change to what any page shows. Purely load behavior.

## Verification

Re-run the same page timings after the change and report before/after numbers, and confirm in the browser that a second visit to a workspace renders instantly from cache and that the Agents hydration error is gone.
