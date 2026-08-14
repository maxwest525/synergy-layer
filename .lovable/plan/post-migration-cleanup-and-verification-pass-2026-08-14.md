# Post-migration cleanup and verification pass

The two migrations landed cleanly, but the repo is not back to green and several
capabilities are still unproven. Here is what I would check next, in priority order.

## 1. Type errors are still open (59 of them)

Confirmed by a typecheck just now. They are concentrated in the files that touch
the new change-measurement engine and the measurement views:

- 36 `TS4111` index-signature access errors (`src/routes/changes.$id.tsx`,
  `src/lib/title-h1-proposals.server.ts`, tests)
- 12 `TS18046` "data is of type unknown" in `src/routes/measurement.tsx`
- 3 implicit `any` parameters, plus a handful of assignment/narrowing errors
  including a `risk` field typed as `string` where the database expects the
  enum values `none | low | medium | high | critical`

These are real: the generated database types were never regenerated after the
new RPCs and tables landed, so the client-side calls fall back to `unknown`.

Fix: regenerate the database types first, then work through the remaining
errors file by file. Nothing here changes behavior, only typing and property
access syntax.

## 2. The change-measurement engine has never actually run

The tables, triggers, and the two service-role RPCs now exist, but no cycle,
window, observation, or revision row has ever been written. Existing means
working only after a real cycle is opened from a real approved change and a
Search Console observation is appended through the RPC.

Fix: open one measurement cycle against an existing approved change request,
append one genuine Search Console observation, and confirm the immutability
triggers reject a second write to the same window.

## 3. Capabilities still blocked, unchanged

Worth restating so none of these is mistaken for working:

- GA4: registry now describes the tenant binding correctly, but there is still
  no server credential, so zero snapshots. Configured, not connected.
- PageSpeed: still zero successful snapshots, three real quota failures.
- GitHub executor: `GITHUB_EXECUTOR_TOKEN` still absent, so the execution loop
  cannot leave preflight.

## 4. Smaller items

- Every `createServerFn().inputValidator()` call logs a deprecation warning on
  each SSR pass. Renaming to `.validator()` is mechanical and quiets the log.
- Nine pre-existing SECURITY DEFINER linter warnings on older functions should
  be reviewed once, then either fixed or explicitly recorded as accepted.

## Suggested order

1. Regenerate types, clear the 59 type errors, confirm lint, tests, and build pass.
2. Prove the change-measurement engine with one real cycle.
3. Decide which blocked capability to unblock next (GA4 credential, PageSpeed
   quota, or GitHub token) and do only that one.

Tell me which of these to start with, or approve the order above.
