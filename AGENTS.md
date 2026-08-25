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

**Never run `npm run format`.** It is `prettier --write .` over the whole
repository and reformats 40+ documents, designs and plans that nobody asked you
to touch. Format only the files you changed: `npx prettier --write <paths>`.

**Four route files belong to a generator, not to you.**
`src/routes/mcp.ts`, `src/routes/[.mcp]/list-tools.ts`,
`src/routes/[.mcp]/invoke-tool/$tool.ts` and
`src/routes/[.well-known]/oauth-protected-resource.ts` are written by
`@lovable.dev/mcp-js`'s Vite plugin on every build, from its own template, and
each one says so in an `AUTO-GENERATED` banner on line 1. They are committed in
exactly the form the plugin emits and are listed in `.prettierignore`, so a
build leaves the tree clean. Do not reformat them: prettier reflows them, the
next build writes the template back, and the tree is dirty again with a lint
error nobody introduced. To take ownership of one, delete its banner line — the
plugin then leaves that file alone.

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

### Where a value lives, and why

**If leaking it costs nothing, put it in code or `.env`. If it authenticates you
to somebody's API or database, it goes in the secret store and is only ever read
inside a `createServerFn` handler or a server route.**

Public identifiers are fine committed: `SELFHOSTED_FIRECRAWL_BASE_URL`,
`N8N_BASE_URL`, `seo.marky.systems`, the Supabase publishable key, a GA4
measurement ID. Anything prefixed `VITE_` ships to the browser on purpose.

A key cannot live in the app, for three reasons:

1. This builds to a browser bundle plus a server worker. Anything in a
   component, a hook, or a `VITE_` variable is downloadable by any visitor —
   view source and the key is theirs. **There is no private part of a frontend.**
2. `.env` is committed, so a key added to it enters GitHub history, and history
   is not rewritable on `main`.
3. Server code reads `process.env` at request time. The value has to be injected
   by the platform at that moment.

The secret store is not an extra hoop. It is the only place that is server-only,
out of git, and readable by `process.env` inside a handler. Same value, different
blast radius.

### The layer that keeps costing hours

**A key placed by a Lovable connector lives at the deployment env layer, not in
the project secret list.** The two are different stores and they fail in
opposite directions:

- A connector's variable can be **absent from the secret list and still answer a
  live probe**, because the running deployment already holds it. That is why
  `FIRECRAWL_API_KEY` read as unset in settings while the connector reported
  healthy.
- Deleting that connector does **not** take the variable away. It survives inside
  the running deployment until the next publish, so everything keeps working and
  nothing looks wrong — until a publish rebuilds the environment and it vanishes.
  That is exactly how Search Console collection died on 2026-08-24: the connector
  was deleted a day earlier, and the next publish cleared it.

The consequence for both directions: **a newly placed secret is not live until
you publish, and a deleted one is not gone until you publish.** Never conclude a
credential is present or missing from the settings screen alone — check after a
publish, or check what the running deployment actually answers.

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
