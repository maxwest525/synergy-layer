# TruMove Inc — every name for every thing

The one-screen answer, then the detail.

| What                    | Where                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **The company**         | TruMove Inc                                                                                                                                                                                                                    |
| **Public website**      | **trumoveinc.com**                                                                                                                                                                                                             |
| ↳ Lovable project       | **TruMove Website Final** (`3c0c30e5-798a-425c-b077-6d5e8cb04e5b`)                                                                                                                                                             |
| ↳ GitHub repo           | **`maxwest525/brittmove-829a7519`**                                                                                                                                                                                            |
| **Marketing OS (AOOS)** | **trumove.marky.systems**                                                                                                                                                                                                      |
| ↳ Lovable project       | **Marky Sysyems** (`4aa4b3cf-b3ab-4721-aff6-e0d55ce13276`)                                                                                                                                                                     |
| ↳ GitHub repo           | **`maxwest525/synergy-layer`** (where the work happens; CI, docs, migrations) and **`maxwest525/trumove-resource-center`** (what Lovable syncs with and production builds from since 2026-08-30; see `DEPLOYMENT_TOPOLOGY.md`) |
| **Instagram**           | **@trumoveinc**                                                                                                                                                                                                                |

Two things, four names each. The website's repo is `brittmove-829a7519`, which
says nothing about TruMove; AOOS's Lovable slug is `trumove-resource-center`,
which sounds like the website and is not. Both live on domains containing
"trumove".

**Publish rule:** a change a customer could see is **TruMove Website Final**. A
change only the operator sees is **Marky Sysyems**.

---

# The two projects, and which is which

There are two Lovable projects with confusingly similar names, and picking the
wrong one wastes time in both directions: a database query returns the wrong
tables, and a publish deploys the wrong thing. This session lost time to exactly
that, and so has the operator.

## AOOS — the marketing operating system

|                                                                 |                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Lovable project name**                                        | `trumove-resource-center`                                               |
| **Display name**                                                | **Marky Sysyems**                                                       |
| **Lovable project id**                                          | `4aa4b3cf-b3ab-4721-aff6-e0d55ce13276`                                  |
| **Editor**                                                      | https://lovable.dev/projects/4aa4b3cf-b3ab-4721-aff6-e0d55ce13276       |
| **Live at**                                                     | **https://trumove.marky.systems**                                       |
| **GitHub repo (code of record)**                                | `maxwest525/synergy-layer`                                              |
| **GitHub repo Lovable actually syncs to, since 2026-08-30**     | `maxwest525/trumove-resource-center` (private). See the warning below.  |
| **Vercel project (shadow of `synergy-layer` main, no secrets)** | `synergy-layer`, `https://synergy-layer.vercel.app`, created 2026-09-01 |
| **Supabase ref**                                                | `zrfzllupoccmztyweznq`                                                  |

> **Warning, verified 2026-09-01.** On 2026-08-30 the Marky Sysyems project's
> GitHub link was moved to a new repository, `maxwest525/trumove-resource-center`.
> Pushes to `synergy-layer` have reached Lovable **nowhere** since then; the
> production app is built from the other repository, which stopped at
> `2cc5efb4` (2026-08-31). Until the two are re-linked, every merge to
> `synergy-layer` `main` has to be merged into `trumove-resource-center` `main`
> as well, or it is not live. The full evidence, the exact divergence and the
> plan to collapse this back to one repository are in
> [`DEPLOYMENT_TOPOLOGY.md`](DEPLOYMENT_TOPOLOGY.md).

This is the internal tool. Findings, recommendations, approvals, workflows,
connectors, the change-request pipeline. **Nobody outside the company sees it.**

Its database holds: `recommendations`, `change_requests`, `dataforseo_snapshots`,
`tracked_keywords`, `ad_vendor_watchlist`, `capabilities`, `workflows`,
`schedules`. If a query for one of those says the relation does not exist, the
wrong project is being queried.

## The website — what customers and Google see

|                          |                                                                   |
| ------------------------ | ----------------------------------------------------------------- |
| **Lovable project name** | `trumoveinc`                                                      |
| **Display name**         | **TruMove Website Final**                                         |
| **Lovable project id**   | `3c0c30e5-798a-425c-b077-6d5e8cb04e5b`                            |
| **Editor**               | https://lovable.dev/projects/3c0c30e5-798a-425c-b077-6d5e8cb04e5b |
| **Live at**              | **https://trumoveinc.com** (also `trumoveinc.lovable.app`)        |
| **Instagram**            | **@trumoveinc**                                                   |
| **GitHub repo**          | `maxwest525/brittmove-829a7519` — note: **not** named "trumove"   |
| **Governed branch**      | `main`                                                            |

This is the public site. Its database holds `content_pages`, `leads`, `jobs`,
`carrier_matches`, `inventory_items`, `specialists`. If a query returns _those_,
the website project is being queried, not AOOS.

## How they relate

AOOS **proposes and executes changes to the website**. It never edits itself.
The allowlist in `src/lib/execution/allowlist.ts` names
`maxwest525/brittmove-829a7519`, branch `main`, project
`3c0c30e5-798a-425c-b077-6d5e8cb04e5b`, origin `https://trumoveinc.com` — those
four values together are the governed execution target, and a change request
naming anything else is refused by the database.

## Which one do I publish?

| If the change was to…                                            | Publish                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `synergy-layer` — findings, rules, UI, migrations                | **Marky Sysyems** (`4aa4b3cf`), and only after the merge has been pushed to `trumove-resource-center` `main` (`DEPLOYMENT_TOPOLOGY.md` §5 step 2); a publish before that push ships nothing new |
| `brittmove-829a7519` — page content, SEO tags, prerender, robots | **TruMove Website Final** (`3c0c30e5`)                                                                                                                                                          |

Rule of thumb: **a change a customer could see is TruMove. A change only the
operator sees is Marky.**

## The naming traps, spelled out

1. **The website's repo is called `brittmove-829a7519`.** Nothing in that name
   says TruMove. It is the right repo.
2. **AOOS's project is called `trumove-resource-center`** and its _display_ name
   is Marky Sysyems. It is not the website, despite "trumove" in the slug.
3. **Both live on domains containing "trumove"** — `trumove.marky.systems` is the
   internal tool, `trumoveinc.com` is the public site.
4. `trumoveinc.lovable.app` and `trumove-resource-center.lovable.app` both exist
   and are different applications.
