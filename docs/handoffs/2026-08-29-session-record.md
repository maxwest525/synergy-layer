# Session record — 2026-08-28 into 2026-08-29

What was found, what was changed, and what is verified live. Written so none of
it has to be rediscovered.

Two repositories were touched: `maxwest525/synergy-layer` (AOOS) and
`maxwest525/brittmove-829a7519` (the public website). Both PRs merged.

---

## 1. The website was invisible to search engines

**The single most consequential finding of the session, and it was not in AOOS.**

Measured against the live site, three URLs — the home page, a real service page,
and a URL that does not exist:

| URL | Status | Visible text | Title | H1 |
|---|---|---|---|---|
| `/` | 200 | **38 chars** | TruMove, AI-Powered Moving Made Simple | none |
| `/services/long-distance-moves` | 200 | **38 chars** | *identical* | none |
| `/this-page-does-not-exist-xyz123` | 200 | **38 chars** | *identical* | none |

A Googlebot user-agent returned the same. This was not a bug: `vite build` emits
one `index.html` holding `<div id="root"></div>`, every route is drawn by
JavaScript in the browser, and `react-helmet-async` sets titles *after* React
mounts, so it cannot affect the HTML a server sends.

Every page therefore shipped the same generic title, no heading, and no content.
An unknown URL returned 200 rather than 404 — a soft 404 across the whole site.

**Fixed** in brittmove PR #4 (merged, CI green): `scripts/prerender.mjs` runs
after `vite build`, opens each page in a real browser, and writes
`dist/<route>/index.html`.

| File | Before | After |
|---|---|---|
| `dist/index.html` | 38 chars | **27,013** |
| `dist/services/long-distance-moves/index.html` | 38 chars | **35,816** |

30 of 30 pages, each with its own H1, meta description and three JSON-LD blocks
in the served source. The route list is read from `public/sitemap.xml`, so the
prerendered set cannot drift from the declared indexable set, and `/admin/*`,
`/portal/*`, `/login` are excluded by being absent from it rather than by a
second list. No new dependency: Playwright was already a devDependency, and the
script installs Chromium once if the build environment has none — caught before
CI reported it, since the workflow runs `bun install` and never downloads
browsers.

**Two problems this exposed, deliberately left for separate changes:**

1. **Nine pages serve the generic sitewide title** — all four service pages, all
   three blog posts, `/inventory-builder`, `/live-walkthrough`. They never set
   their own. Invisible while every response was a shell.
2. **`/plan-variants` and `/showcase` render 783 characters with no H1**, against
   5,000–12,000 elsewhere, while listed as indexable.

**Still open:** the site returns 200 for unknown URLs. Real files now exist per
route, which is the precondition for a real 404, but the host still needs to be
told to stop serving the shell for everything else.

---

## 2. "Everything reverts to title and H1" was a hard constraint, not a habit

The operator raised this repeatedly across months. It was true, and every
previous fix — including one earlier the same day — landed above the layers that
mattered. **Four** independently forced it:

1. The generator demanded both change and returned exactly two.
2. `create_title_h1_proposal` enforced `jsonb_array_length(_changes) <> 2` —
   an **equality**, from migration `20260814080000`. One change, three changes,
   a subheading fix: all refused by the database.
3. `apply_change_request_rendered_proof` looked up `seo_title` and
   `page_heading` by name, so nothing else could be proven live.
4. `verifyRenderedPage` refused any change lacking both.

Since a change that cannot be proven live cannot be approved, layers 3 and 4
alone would have held it at two fields forever.

**All four removed** (synergy PR #85, merged; migration applied and verified).
`RenderedPage` now carries every H2 so a subheading is provable; the lane accepts
one or more changes from an owned field set; the generator emits whatever
genuinely changed and drops a rewrite naming a heading not on the page. 21 new
tests.

Renaming the lane to `page_wording` earlier in the day changed none of this — it
gave a title-and-H1 editor a name that says "page wording", which made the limit
harder to see, not easier.

**Deliberately still `null`:** `PAGE_CHECK_FIX.h2_missing`. It fires when a page
has *no* H2, and the executor only does exact string replacement — there is no
`before` text to match. Closing it needs a governed **insertion** change kind,
which is different work.

---

## 3. The keyword set measured a contest TruMove is not in

`tracked_keywords` held 40 terms, **every one a synonym of "best long distance
movers"**. Zero route queries. Meanwhile the competitors winning organically win
by owning a route matrix — moveBuddha's `/popular-routes/{from}/{to}/`, up to
~2,450 cells — and trumoveinc.com has no route pages at all.

Head terms are also precisely what listicle publishers (ConsumerAffairs and
similar, named by the operator) are built to win. So the tracked set measured the
one query shape where a broker is least likely to rank.

**Fixed:** 10 California→Texas keywords added, labelled `route:ca-tx`, the
operator's stated first route. Verified live.

---

## 4. Competitor intelligence: what was found

A free, working route into Google Ads Transparency was established — the
internal `SearchCreatives` RPC over plain curl, no key or cookie, documented in
`docs/context/COMPETITOR_RESEARCH_LOG.md`. Playwright cannot reach Google from a
session container at all (TLS fingerprint rejected upstream); curl can.

**Paid market, measured across eleven owners:**

| Owner | Creatives | Live 7d |
|---|---:|---:|
| Katz Group (budgetvanlines, 2movers, quoterunner, uload) | 2,606 | 2,236 |
| UniGroup (unitedvanlines, mayflower) | 1,924 | 1,397 |
| SIRVA (allied, northamerican) | 697 | 332 |
| *seven others* | 580 | 220 |
| **TruMove** | **1** | — |

Findings the operator did not have:

- **`uload.com`** — a Katz brand running 278 creatives, 146 live, absent from the
  watchlist. Added. Its advertiser is "Quote Runner, **LLC**"
  `AR16136027762673582081` — a *different account* from "Quote Runner llc"
  `AR15552671483326103553` behind quoterunner.com. One comma apart, so neither
  name nor domain matching had caught it.
- **`resultcalls.com` and `doppcall.com` share one advertiser account**
  (`AR10383348317303078913`). Ownership found in the data rather than asserted.
- **Two Movers has no ad account.** All 800 of its creatives are paid for by
  *Budget Van Lines Inc.* Each Katz entity fronts the next brand down, so no
  brand traces to one advertiser at a glance.

**Two corrections the operator forced**, both recorded: an early claim that Katz
held "94% of the paid market" was 94% of a seven-domain lead-vendor watchlist,
not the market — brokers and carriers advertise too. And the competitive unit is
the **ranking page**, not the company: an earlier draft of the doctrine named the
owning organisation, which was wrong.

**Limit worth remembering:** Ads Transparency returns the advertiser's verified
domain and **never** the click destination. Landing pages come only from the live
paid SERP (`ad_live_serp_observations`, currently 0 rows).

---

## 5. Other fixes shipped

- **Production 500 on AOOS** — every route, all day. A test file inside
  `src/registry/modules/` was swept into the production server bundle by an eager
  `import.meta.glob`, and vitest's `describe()` ran at server start with no
  runner. Lint, typecheck, tests and build all passed; only running the *built*
  server failed, and nothing ran the built server. Fixed in synergy PR #86.
- **Six pending migrations applied**, plus `20260828160000` (the wording unlock),
  all verified live.
- **Competitor page observer** no longer throws when Firecrawl is absent —
  Crawl4AI first, matching the page audit.
- **`/ads` reported success as failure.** "No competitor was checked" appeared in
  red on a fully-resolved watchlist. Now distinguishes *nothing left to do* from
  *the service refused*.
- **Guidance mounted on the Command centre.** A 900-line next-action engine with
  18 rules existed, mounted only on `/essentials` under "Evidence", with nothing
  linking to it from the page operators land on — whose own subtitle reads "What
  needs you first, and the fastest way to clear it".
- **OpenSEO scope decision recorded**: it is a DataForSEO front end; Google data
  does not route through it.

---

## 6. The recurring pattern, named

Five instances found in one day of evidence collected competently and then
routed somewhere it cannot act:

| Evidence | Reached | Should reach |
|---|---|---|
| Ads Transparency | page-wording generation, as "corroboration" | the competitor engine |
| Operator classification | a dropdown | competitive scoring |
| Competitor page observations | `knowledge_entries` | the findings queue |
| 24 DataForSEO reports | stored snapshots | findings |
| Next-action guidance | one buried page | the landing page |

Plus three vendor schedules built, seeded and **never enabled**.

Wiring an analysis to a consumer is not a finishing touch on this project. It is
the step that keeps being skipped, and it is why the same conversation recurred
for months.

---

## 7. Open work

**Needs the operator:**
- Merge/publish is done; the website prerender is live on merge to `main`.
- The free SerpApi gate check on `/ads` (zero credits) unblocks the paid rules.
- More routes beyond California→Texas, when wanted.

**Ready to hand out:** `docs/handoffs/2026-08-28-parallel-rule-sessions.md` — four
parallel session prompts covering 18 finding rules that survived adversarial
grounding out of 28 proposed. Ten were killed for reading snapshot kinds nothing
writes, inventing thresholds, or rendering absence as a clean reading. One of the
killed rules came from this project's own doctrine.

**Known and unbuilt:**
- Governed insertion change kind (unblocks `h2_missing`).
- Keyword-to-page-content join (cannibalisation).
- Real 404s on the website.
- Nine website pages with no title of their own.
