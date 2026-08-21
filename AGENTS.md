<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Working in this repository

For anyone changing this code, human or agent. Read
[`README.md`](README.md) for what the project is and
[`docs/context/CURRENT_BUILD.md`](docs/context/CURRENT_BUILD.md) for where the
build has got to. This file is the contract for making changes.

## Before you write anything

1. **Read the current state.** `docs/context/CURRENT_BUILD.md` records what is
   live, what is blocked, and what is waiting on a human. It is the fastest way
   to avoid rebuilding something that exists or wiring something that is
   deliberately not wired.
2. **Documentation-first for anything touching a provider.** Authoritative
   vendor documentation is read and digested into
   `docs/integrations/<provider>/DIGEST.md` *before* integration code is
   written. No exceptions, no digests written from memory, no secrets in a
   digest.
3. **Check the governing contract.** If you are touching a schema, threshold,
   lifecycle, permission or execution guard, the matching document in
   `docs/execution-handbook/` is updated in the *same* change.

## The rules that will fail review

- **No demo data.** Every number is a stored row. A failed read renders a named
  absence, never a zero. Absence is stated in words.
- **No lying controls.** A verb that is not legal renders *nothing* — never a
  disabled button, never one that throws. Where an operator would reasonably
  expect a control, an on-screen sentence explains why it is absent.
- **No invented thresholds.** Every rule cites primary-source wording or carries
  a `Stated assumption:` comment naming what would settle it. Lowering a
  threshold until a rule fires is how a system starts reporting noise as
  findings; it is the exact failure this project exists to prevent. New rules
  are registered in `src/lib/rule-buckets.ts` with a bucket (`fact`, `pooled`,
  `beyond_current_volume`) and any non-volume prerequisites in `alsoNeeds`.
- **No threshold value copied by hand.** Reference the threshold objects
  (`rule-thresholds.ts`, `search-console-rule-checks.ts`). A copied number
  drifts, and has.
- **No approval bypass.** Page changes route through `/changes/$id` and
  `runTransition`. Nothing writes an approved or applied state directly.
- **Metered calls on an operator click only, with the cost on the button.** No
  page load, no unapproved schedule.
- **No stubs, no placeholder credentials.** `.claude/hooks/no-fake-wiring.sh`
  blocks the commit. Wire it for real or leave it out.
- **Surgical diffs.** Every changed line traces to the task. Do not reformat,
  refactor or improve adjacent code on the way past.

## Copy style, on screen

Plain operator words. No rule ids, no stored enum values, no `snake_case`, no
fingerprints, no snapshot ids, no raw JSON anywhere an operator can read it. No
em dashes. Dark theme, semantic tokens from `src/styles.css` only — never a raw
hex — and outlined buttons.

Developer-facing reasoning (`RuleAssignment.why`, module headers) is written for
the next reader of the code and must never reach the screen.

## Testing

Vitest, with the test file beside the module. `describe` blocks state the prose
claim being verified rather than naming the function. Failing test first, then
the minimal implementation. See `src/lib/suggestion-queue.test.ts` and
`src/components/os/site-health-page.test.tsx` for the house style.

One gotcha worth knowing before it surprises you: the 16 files in
`docs/execution-handbook/` are *input data*, ingested as governed knowledge, so
editing any of them moves the pinned token estimate in
`scripts/ingest-governed-knowledge.test.ts`. Re-run the script and paste the new
total. That failure is the expected cost of a documentation change, not a
regression.

Several registries are exhaustive by type (`Record<CheckId, …>` in
`src/lib/audit-fixes.ts`, the finding-copy and rule-bucket maps). That is the
intended forcing function: adding an id without its copy, its fix target or its
bucket fails `tsc`. Do not widen those types to get past it.

## The gate, before every push

```sh
npm run lint && npm run typecheck && npm test && npm run build
```

All four run in CI on every pull request and the job fails on the first one that
fails. Green on `main` at `2a2e87f`: 1168 tests in 118 files.

**Run lint after build, not before.** `npm run build` rewrites four files in
place — `src/routes/mcp.ts`, `src/routes/[.mcp]/list-tools.ts`,
`src/routes/[.mcp]/invoke-tool/$tool.ts` and
`src/routes/[.well-known]/oauth-protected-resource.ts` — collapsing their
formatting, which then fails prettier. Reproduced at `2a2e87f`. It is a build
side effect and not your change: `git checkout -- src/routes/` after building,
and do not commit those four files unless you actually edited them.

## Session start, on the web

`.claude/hooks/session-start.sh` runs at the start of a Claude Code on the web
session and installs dependencies with `npm ci`, so the gate above works from
the first turn. It is remote-only (`CLAUDE_CODE_REMOTE`), so it never touches a
local checkout, and it skips the install when `node_modules` already matches
`package-lock.json`, so re-running it is free.

It uses `npm ci` rather than `npm install` on purpose: `npm install` rewrites
`package-lock.json` when it disagrees with `package.json`, which would hand
every session a dirty tree it did not create. If the hook fails with a lockfile
mismatch, the fix is to sync the lockfile in a commit, not to loosen the hook.

## Git

- Work on a branch and open a pull request. `main` syncs to Lovable.
- **Never rewrite published history** — no force push, no rebase, amend or
  squash of pushed commits. See the Lovable notice above.
- `src/routeTree.gen.ts` is generated. Never edit it by hand, and never mutate
  the route tree at runtime.
- `.env` is committed and holds public Supabase config only. Secrets go where
  the deployment keeps its secrets.

## When you finish

Update the record you invalidated, in the same change:

| You changed | Update |
| --- | --- |
| What is live, blocked, or waiting on a human | `docs/context/CURRENT_BUILD.md` |
| A schema, threshold, lifecycle, permission or execution guard | the matching `docs/execution-handbook/` contract |
| Provider behaviour you learned from vendor documentation | `docs/integrations/<provider>/DIGEST.md` |
| A phase of the category-page redesign | `docs/superpowers/plans/category-page-redesign-STATE.md` |
| Work someone else will pick up | a dated file in `docs/handoffs/`, with its status on the first line |

A handoff whose status line is wrong is worse than no handoff. When you finish
the work a handoff describes, close it in the same change.
