# AOOS — the marketing operating system behind Marky

**AOOS** is the internal name; **Marky** is the name on screen. One application,
one operator, one property today (`trumoveinc.com`).

It is not the public TruMove website and it is not a CRM. It is the system that
collects evidence about a website from the accounts that already watch it —
Google Search Console, GA4, DataForSEO, Firecrawl, Umami, SerpAPI — turns that
evidence into a small number of suggestions in plain words, and refuses to change
anything until a human approves it.

New here? Read this file, then
[`docs/context/CURRENT_BUILD.md`](docs/context/CURRENT_BUILD.md) for where the
build actually is, then [`AGENTS.md`](AGENTS.md) before you write a line.

## The five rules everything else follows from

These are not style preferences. Most of the code that looks unusual in this
repository looks that way because of one of them.

1. **No demo data, ever.** Every number on screen comes from a stored row. A
   read that fails renders a named absence, never a zero. "We have no data" and
   "the value is zero" are different sentences and the UI says which one it is.
2. **Configured is not connected, and collected is not delivered.** A credential
   proves nothing. A stored row proves nothing reached the operator.
   `src/lib/connections.ts` grades every account against four stages and names
   the ones that stop at stage three — collecting rows, some of them paid for,
   that nothing turns into anything visible.
3. **Nothing deploys automatically.** Every page change goes through
   `/changes/$id` and `runTransition`. No code path may write an approved or
   applied state directly. "Applied" means proven live on the public URL.
4. **No threshold is invented to make a rule fire.** Every finding rule cites a
   primary source or carries a written `Stated assumption:`. A rule the traffic
   cannot answer says so on screen instead of shipping a number that produces
   noise. See `src/lib/rule-buckets.ts`.
5. **Metered provider calls fire on an explicit operator click, with the cost on
   the button.** Never on page load, never on a schedule that was not approved.

The commit hook at `.claude/hooks/no-fake-wiring.sh` blocks commits containing
stubs or placeholder credentials, because a stub that returns a plausible value
is indistinguishable from working code until someone checks.

## The shape of it

| Layer          | Where                                                                                              | What it is                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Navigation     | `src/lib/categories.ts`                                                                            | Seven slots, capped permanently. A new feature goes _inside_ a category, never beside one.                                  |
| Category pages | `src/components/os/*-page.tsx`                                                                     | Command center plus Getting found on Google, Your pages, Site health, Connections.                                          |
| View models    | `src/lib/{getting-found,your-pages,site-health,connections,command-center}.ts`                     | Pure, exhaustively tested. Every tile carries `value: null` plus a `missingReason` when no row backs it.                    |
| Reads          | `*.functions.ts`                                                                                   | One tenant-scoped fetch per page, every read `assertRead` guarded so a failure raises instead of arriving as a zero.        |
| Rules          | `src/lib/{search-console-rule-checks,page-checks,targeting-rules,ga4-rule-checks,robots-rules}.ts` | Pure functions over stored rows. 30 page checks, 24 bucketed finding rules.                                                 |
| Queue          | `src/lib/suggestion-queue.ts`                                                                      | open / ignored / done, dedup by fingerprint, urgency ranking, seven visible per week.                                       |
| Registries     | `src/registry/modules/*.ts`                                                                        | Capabilities, agents, workflows and schedules declared as data and synced to the database. No hardcoded per-integration UI. |
| Providers      | `src/lib/{dataforseo,serpapi,umami,measurement,execution,mcp}/`                                    | Adapters, spend ledgers, guards.                                                                                            |
| Database       | `supabase/migrations/`                                                                             | 82 migrations. Multi-tenant, RLS on every registry table.                                                                   |

Stack: TypeScript, React 19, TanStack Start / Router / Query, Tailwind 4,
Supabase (Postgres + RLS), Vitest + Testing Library, Vite 8.

## Running it

```sh
npm ci
npm run dev
```

The verification gate, which CI runs on every pull request:

```sh
npm run lint       # eslint + prettier
npm run typecheck  # tsc --noEmit, strict (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
npm test           # vitest run
npm run build
```

Verified on 2026-08-28, measured on the deletion-pass branch off `main` at
`47f6ae9`: typecheck clean, 1381 tests in 128 files passing, lint 0 errors with
the 14 pre-existing react-refresh warnings, build green.

`.env` is committed and holds only public Supabase config. Server secrets —
provider keys, `LITELLM_API_KEY`, `GITHUB_EXECUTOR_TOKEN` — live where the
deployment keeps its secrets and are never written into this repository, into
knowledge documents, or into provider digests.

## Where the records are

| Document                                                                    | What it is for                                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/context/CURRENT_BUILD.md`](docs/context/CURRENT_BUILD.md)            | **Current state only.** What is live, what is blocked, what is pending approval, what is next. Start here.                                                 |
| [`AGENTS.md`](AGENTS.md)                                                    | The working contract for anyone, human or agent, making changes.                                                                                           |
| [`docs/execution-handbook/`](docs/execution-handbook/INDEX.md)              | The governing contracts: source of truth, evidence policy, proposal data contract, validation gates, execution and rollback, outcome measurement.          |
| [`docs/integrations/<provider>/DIGEST.md`](docs/integrations)               | Authoritative provider behaviour, digested from the vendor's own documentation before any integration code was written. Never overwrite these from memory. |
| [`docs/superpowers/{plans,specs,research}/`](docs/superpowers)              | Per-lane plans and the research they argue from. Dated, and superseded rather than edited.                                                                 |
| [`docs/handoffs/`](docs/handoffs)                                           | Work orders written for whoever picks the thread up next, with their status at the top.                                                                    |
| [`docs/context/ORIGINAL_BRIEF.md`](docs/context/ORIGINAL_BRIEF.md)          | The 2026-08-04 prompt the project started from, kept verbatim as history.                                                                                  |
| [`.claude/skills/seo-measurement/SKILL.md`](.claude/skills/seo-measurement) | The method for grounding any SEO rule, threshold or verdict in a primary source.                                                                           |

When these disagree, precedence is set by
[`SOURCE_OF_TRUTH.md`](docs/execution-handbook/SOURCE_OF_TRUTH.md): live
production first, then code and applied migrations, then dated evidence
snapshots, then policy, then plans, then chat. Record the contradiction; do not
silently pick the convenient source.

## Build with Lovable

This project is connected to [Lovable](https://lovable.dev) and continues to be
developed in the [Lovable editor](https://lovable.dev/projects/4aa4b3cf-b3ab-4721-aff6-e0d55ce13276).

- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

Because of that sync, published git history is never rewritten here. See
[`AGENTS.md`](AGENTS.md).
