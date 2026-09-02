# Status: OPEN — seven session prompts, none run

Written 2026-08-29 to answer a standing request: *"we need to prompt other
sessions with a narrow scope to look at some of the other marketing projects
that i have because they could provide missing pieces for you… deep strategy
type of stuff not just connectors."*

The Lovable workspace **Max** (`vWcFojtqj6kiK2ryicqE`) holds **102 projects**.
Most are from a two-day burst on 2026-07-18/19 and are single-screen
experiments. Seven are worth a session each, chosen because their own
descriptions name a capability AOOS is measurably missing — not because the
name looked relevant.

## The trap these prompts are built to avoid

Several of these projects say, in their own description, that they are
**mockups**: "mock data", "front-end demo first (dummy data, local state)",
"a futuristic web app mockup". A session that comes back with "port this, it
already does attribution" when the attribution is four hardcoded rows has cost
more than it returned.

So every prompt below ends with the same demand, and it is not optional:

> For each thing you bring back, state which of these it is:
> **(a) working code** that runs against real data — name the file and the data
> source; **(b) a mockup** — a UI over hardcoded or generated values; **(c) a
> prompt** — something someone typed once that no code implements.
> A (b) or a (c) can still be worth having. Calling one an (a) is the failure.

## How to run these

One session per prompt, in parallel, on a cheaper model — these are read-and-
report jobs, not build jobs. None of them writes code. Each returns one markdown
document. Paste the prompt verbatim; the framing is doing work.

Reading a Lovable project without cloning it: `mcp__Lovable__list_files` and
`mcp__Lovable__read_file` with the project id, and `mcp__Lovable__query_database`
for its tables. Where a GitHub repo is connected, that is faster.

When a session returns, its findings become backlog items in
[`../context/BACKLOG.md`](../context/BACKLOG.md) with new IDs — not a paragraph
at the bottom of this file.

---

## Prompt 1 — the autonomous marketing loop that already exists somewhere

**Project:** `crm-trumoveinc` — "TruMove CRM FINAL" — `128b488c-44b4-491c-81db-13ee1d434085`
**Shopping for:** backlog **OP-3** (runtime agents: build or remove)

> Read the Lovable project `128b488c-44b4-491c-81db-13ee1d434085` ("TruMove CRM
> FINAL"). Its own description claims **"autonomous marketing loops"** and
> **"dynamic workflow generation"**. I need to know what those two phrases
> actually refer to in the code.
>
> Answer these, in order, each with the file and line that proves it:
>
> 1. Is there a loop that runs without a human starting it? What triggers it —
>    cron, a webhook, a database trigger, a button someone has to press?
> 2. What does one pass of the loop *do*? List the steps in order. Where does it
>    get its input and where does the output go?
> 3. Does it decide anything, or does it execute a fixed sequence? If it decides,
>    what does it decide between and on what evidence?
> 4. "Dynamic workflow generation" — is a workflow generated from a description,
>    assembled from a fixed set of blocks, or picked from a list?
> 5. What stops it doing something wrong? Approval, a dry run, a spend cap,
>    nothing?
>
> Do not recommend porting anything. I want to know what is there.
>
> [+ the (a)/(b)/(c) demand]

**Why this one first:** AOOS has a workflow runner, a registry and a schedule
table, and the open question is not how to orchestrate agents but what an
autonomous pass should *do*. If a previous project already answered that, even
badly, the answer is worth more than another orchestrator comparison.

---

## Prompt 2 — lead-vendor economics

**Projects:** `truviewocc` — "Sales Navigator Pro" — `ac2455c7-d0ec-489d-882e-fb0d8fbba7a6`
`boyoboyd` — "SGBB CRM" — `fcd34420-c199-4d0c-94b1-35a00024744e`
**Shopping for:** the economics half of `docs/execution-handbook/COMPETITIVE_MODEL.md`

> Read two Lovable projects: `ac2455c7-d0ec-489d-882e-fb0d8fbba7a6` ("Sales
> Navigator Pro") and `fcd34420-c199-4d0c-94b1-35a00024744e` ("SGBB CRM"). Both describe **lead vendor analytics**, **lead vendor
> profitability**, and **AI-driven recommendations on lead allocation and vendor
> funding**.
>
> These were built for insurance, not moving. I do not care about the vertical.
> I care about the model underneath. Answer:
>
> 1. What does a lead vendor record hold? List every field and say which are
>    entered by a human and which are computed.
> 2. How is a vendor's profitability actually computed? Give me the arithmetic,
>    not the description of it. What is the numerator, what is the denominator,
>    over what window?
> 3. What makes one vendor better than another in this model? Name the ranking
>    and its inputs.
> 4. What does a "recommendation on lead allocation" contain? Quote one, real or
>    from a fixture.
> 5. Is there any notion of a vendor *competing with you* rather than supplying
>    you? Anywhere?
>
> [+ the (a)/(b)/(c) demand]

**Why:** AOOS's competitive doctrine says third-party lead vendors are TruMove's
true search rivals, and it has ads-transparency counts for them and nothing else.
A model of vendor economics built for a different vertical is still a model.

---

## Prompt 3 — attribution from spend to a booked job

**Projects:** `dialer-iq-command-center` — `b1c9467e-33cd-4294-b7b6-d509d60cdc4a`
`convoso-ops-nexus` — `93ac864e-f817-4cfc-9522-ea3f6d324f64`
`astro-dialer-view` — `c21e9760-9530-46f3-8453-f4eb60ceee09`
**Shopping for:** the missing end of `docs/execution-handbook/OUTCOME_MEASUREMENT.md`

> Read these three Lovable projects — `b1c9467e-33cd-4294-b7b6-d509d60cdc4a`
> (DialerIQ Command Center), `93ac864e-f817-4cfc-9522-ea3f6d324f64` (Convoso Ops
> Nexus) and `c21e9760-9530-46f3-8453-f4eb60ceee09` (Convoso Command OS). All three claim **revenue
> attribution** and **call intelligence**. They may be three passes at one idea;
> say so if they are, and then read the best one closely.
>
> The question is narrow: **what chain of records connects money spent to money
> earned?**
>
> 1. Draw the chain. Which table joins to which, on what key, from the first
>    touch to the booked revenue? If a link is missing, say where it breaks.
> 2. What is the unit of attribution — a call, a lead, a campaign, an agent?
> 3. What happens when two sources could claim the same booking? Is there a
>    rule, or does the last one win?
> 4. Where does the revenue number come from — is it entered, imported, or
>    invented for the demo?
>
> [+ the (a)/(b)/(c) demand]

**Why:** AOOS measures a published change against search metrics — impressions,
clicks, position — and stops there. It cannot say a title rewrite produced a
booked move. That is the gap between an SEO tool and a marketing OS, and one of
these projects may already have the join.

---

## Prompt 4 — the model layer

**Project:** `omni-core-78` — "Multi-LLM Command Center" — `a0c55a81-9353-4ff7-b18e-7636f01ff911`
**Shopping for:** backlog **CODE-2** (Gemini bypasses LiteLLM, no spend ceiling) and the standing "is our LLM setup optimal" question

> Read the Lovable project `a0c55a81-9353-4ff7-b18e-7636f01ff911`
> ("Multi-LLM Command Center"). It runs several models at once and shows their
> outputs side by side.
>
> 1. How does it call models — one gateway, or a client per provider? Name the
>    file.
> 2. Does it show cost per call? Where does the number come from — a real
>    usage field in the response, or a hardcoded rate table?
> 3. Is there a spend ceiling anywhere? What happens when it is hit?
> 4. How does it decide which model gets which job, if it does?
> 5. Does anything compare outputs from two models on the same input and pick
>    one? On what basis?
>
> [+ the (a)/(b)/(c) demand]

**Why:** AOOS routes some calls through LiteLLM and calls Google directly for
page wording and every embedding, with no budget guard on the direct path — the
only metered provider in the repo with no ceiling. Whatever this project does
about cost visibility is worth seeing before that is redesigned.

---

## Prompt 5 — the MCP surface

**Project:** `trumovemcp` — "Trumove MCP Final" — `c8c567fc-f58f-480b-a9e0-57cfcd51b4c8`
**Shopping for:** AOOS's own MCP server, measured at zero use

> Read the Lovable project `c8c567fc-f58f-480b-a9e0-57cfcd51b4c8` ("Trumove MCP
> Final"), which describes integrating "existing HyperMCP modules".
>
> 1. What tools does it expose? List every one with its input and output.
> 2. Which of them **write** — change data, send something, call an external
>    API with a side effect — and which only read?
> 3. What authenticates a caller, and what is a caller allowed to do?
> 4. What is "HyperMCP"? Is it a package, a pattern, or a name for this
>    project's own modules?
> 5. Is anything actually calling this server? Look for evidence, not intent.
>
> [+ the (a)/(b)/(c) demand]

**Why:** AOOS ships its own MCP server, and a measurement in the 2026-08-25
remediation plan found its usage is **zero**. Before deciding whether to build
runtime agents on top of it, it is worth knowing what a second attempt at the
same idea exposed and whether anything ever called it either.

---

## Prompt 6 — the design system and the navigation

**Project:** `launchos-foundation-kit` — "LaunchOS Core UI Kit" — `894bb3ea-b562-4456-a889-dfd532cfe53a`
**Shopping for:** backlog **CARRY-7** (UI pieces to work in) and **CARRY-9** (routing and paths)

> Read the Lovable project `894bb3ea-b562-4456-a889-dfd532cfe53a` ("LaunchOS
> Core UI Kit") — a design system and component library for SaaS applications.
>
> 1. Inventory the components. For each: what it is, and whether it is a
>    wrapper over shadcn/ui or something built from scratch.
> 2. What does it define beyond components — colour tokens, typography scale,
>    spacing, motion? List the tokens.
> 3. Is there a navigation or information-architecture pattern in it? How does
>    it decide what belongs in a sidebar versus a page versus a panel?
> 4. Which components have no equivalent in a stock shadcn/ui project? Those are
>    the ones worth knowing about.
>
> [+ the (a)/(b)/(c) demand]

**Why:** an operator could not find a 900-line next-action engine because it sat
on one page filed under "Evidence". That is an information-architecture failure,
not a styling one, and question 3 is the one that matters.

---

## Prompt 7 — the website's conversion path and page inventory

**Projects:** `sparky-builder-buddy` — TruMove Landing, a multi-step quote funnel — `17b04297-f7eb-453b-ac37-5d20ccd6b0f4`
`clear-auto-move` — one `/auto-transport` page built to match the design system — `9bf63e20-a02d-4e9c-8ce1-b8d5ae7e120a`
`move-tracker-spark` — a customer-facing tracking map — `02973b58-b602-423b-97e5-1e3f31e52bc2`
**Shopping for:** backlog **OP-6** (two unbuilt category pages), **CODE-11**, **OP-7**

> Read three Lovable projects: `17b04297-f7eb-453b-ac37-5d20ccd6b0f4` (TruMove
> Landing), `9bf63e20-a02d-4e9c-8ce1-b8d5ae7e120a` (Auto Transport) and
> `02973b58-b602-423b-97e5-1e3f31e52bc2` (tracking map). All three are pages or flows built for the TruMove
> website (`trumoveinc.com`, Lovable project
> `3c0c30e5-798a-425c-b077-6d5e8cb04e5b`, repo `maxwest525/brittmove-829a7519`).
>
> 1. For each: does the live site at trumoveinc.com already have this page or
>    flow? Check, do not assume.
> 2. The Auto Transport project builds one new page and adds it to the primary nav. Write
>    out the recipe it follows — route, layout, SEO tags, nav entry, sitemap
>    entry, anything else. That recipe is what I need repeatable.
> 3. Does any of them set its own `<title>` and meta description, or do they
>    inherit a sitewide one?
> 4. TruMove Landing is a multi-step quote funnel. What are the steps,
>    what is required at each, and where does a completed funnel send its data?
>
> [+ the (a)/(b)/(c) demand]

**Why:** the website has two unbuilt category pages and nine pages with no title
of their own, and needs a route matrix it does not have. Question 2 is the
deliverable — a written recipe for adding one indexable page correctly — and it
is worth more than any of the three pages.

---

## Projects deliberately not surveyed

For the record, so nobody re-derives the shortlist:

- **`trumovecrm`, `trumove`, `trumovetransport`, `smooth-terrain-tool`,
  `github-linky-love`, `hub-link-happy`, `github-hugger-18`** — earlier or
  abandoned passes at connecting a GitHub repo. Two have a *question* as their
  description ("how do i transfer or connect a project from my github").
- **`youmove`** — a landing-page mock replicating a layout. Design reference only.
- **`fartbrains`** — already integrated. Its "Mark" folder is the second brain;
  21 of 84 items are in `kb.research` and 63 are not (backlog **CARRY-4**).
- **`leonardosource`, `leosource-health-hub`, `health-hug-crm`, `truenroll`,
  `path-to-calm-coverage`, `resiclaims`, `taxreliefiq`** — a different business.
  `truviewocc` and `boyoboyd` are surveyed above *despite* being insurance
  because the lead-vendor model transfers; these do not.
- **`sonic-insight-deck`, `boydy-boyd`, `everglades-cinematic-bloom`,
  `street-pulse-connect`** — visual demos over dummy data, by their own
  descriptions. Worth a look for **CARRY-7** when UI work starts, not now.
- **`jewmove-trade-dash`** (options trading), **`babysitter-bright-times`**,
  **`junkdetector`**, **`home-sparkle-catalog`**, **`yourppm`**,
  **`smooth-sail-creator`**, **`ronytobbins`**, **`jeremyminer`**,
  **`tampa-tam-pon`**, **`sithappens`**, **`lig-ma-trans-port`**,
  **`flexi-kidz-ecosystem`**, **`friendly-folks-log`** and the ~50 untitled
  projects from 2026-07-18/19 — unrelated.
