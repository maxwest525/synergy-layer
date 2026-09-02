# AOOS Current Build Context

> **Open work lives in [`BACKLOG.md`](BACKLOG.md), not here and not in the handoffs.**
> This file records current state. That one records what is still owed, with a
> stable ID per item and a grade saying whether it was verified or only carried
> forward. If you are looking for "what is left to do", that is the file.

> **2026-08-29 — read the session record first.**
> [`docs/handoffs/2026-08-29-session-record.md`](../handoffs/2026-08-29-session-record.md)
> covers a session that changed several things this file assumes.
>
> The two that matter most:
>
> 1. **The public website served 38 characters of text on every URL**, with one
>    sitewide title and no H1, including to Googlebot — a Vite SPA whose words
>    only existed after JavaScript ran. Fixed by prerendering (brittmove PR #4,
>    merged): 30 pages now ship 27,000–35,000 characters each. Any conclusion in
>    this file drawn from thin search evidence predates that fix.
> 2. **The page wording lane was locked to exactly two changes by the database**,
>    not by preference — `jsonb_array_length(_changes) <> 2`, an equality, since 20260814080000. Four layers enforced it. All four are removed and the
>    migration is applied, so the lane now edits subheadings too.

Purpose: a lightweight, always-current handoff note so a future agent run does not
lose decisions made in chat. This file records **current state only**: architecture,
live integrations, pending approvals, active workflows, and next priorities.

It is not authoritative documentation. Provider digests under
`docs/integrations/<provider>/DIGEST.md` and their PLAN files remain the source of
truth for provider behaviour and must never be overwritten by this file.

Last updated: 2026-08-31, after wiring Google Ads campaign reporting
(CODE-28) on top of the four merged CODE-6 rule sessions
(A: OnPage, B: Backlinks, C: Umami, D: discovery). Section 0 below still
describes 2026-08-21 and has NOT been rewritten; the current-state blocks
immediately below supersede it.

## 0bh. Connections say when the newest row arrived, 2026-09-02

"Reaching you" carried no date, so an hour-old and a month-old connection
read the same. Each stored table now names its timestamp column,
checked against the generated types, the facts read the newest
successful row through the same filters as the counts, and every row
with a store says when that row arrived or that none has (CODE-77, the
second half of STATE-4).

## 0bg. No em dashes reach the screen, 2026-09-02

They had reached a dozen surfaces and stood in for an absent value on 25
metric cells, and 44 tab titles used one while five used a middle dot.
Every sentence now separates its clauses with a comma, colon or full
stop; an absent value reads "not reported", "not observed" or "not
recorded"; every tab title ends " · Marky"; and a test walks every screen
file and the copy modules and fails on the first one back (CODE-81, from
COPY-2).

## 0bf. A stopped daily read reaches the Command center, 2026-09-02

The cadence card already derived "overdue" from the schedule row, but
nothing else read it: the next actions needed a recorded failed run and
the status line could not see it. One shared read (`readObservationCadences`)
now feeds the card, a next action naming the stopped read with its due
time, and a status line that says "N daily reads are overdue" ahead of a
failing provider (CODE-80, from MEAS-10).

## 0be. Agent chat reads the workspace the operator selected, 2026-09-02

The evidence tools behind Ask resolved the tenant from the operator's
first membership row; every other server read uses the saved active
tenant first. They now share `resolveTenantId`, so the agent answers
about the workspace named in the shell's switcher (CODE-79, from AGT-14).

## 0bd. The waiting-on banner counts the page's own rules, 2026-09-02

Three pages each built the thirteen-key prerequisite state by hand and
had drifted, and the banner counted every rule in the registry, so Your
pages could say seventeen checks were waiting on a second collection when
none of its rules needed one. One builder holds the not-read-here default,
each page passes what it reads plus its category, and the count is scoped
to rules that land on that page; every rule with a prerequisite now names
its category by rule, pinned by test (CODE-78, from CQ-8).

## 0bc. The Command center says when each number was true, 2026-09-02

The category pages dated their own windows; the Command center, which
draws on all of them, dated nothing, and "All systems normal" carried no
time. One line under the heading now dates the search window, the visits
window, the newest page observation and the newest connection probe, or
names the one that is missing, and the status line says the stored moment
its claim rests on: the newest probe for a broken connection, the newest
run for a failing provider, the older of the two for green (CODE-76, from
STATE-4). The Connections rows still carry no date (CODE-77).

## 0bb. PageSpeed no longer offers a cadence nothing can tick, 2026-09-02

The cadence card offered "Turn on the daily cadence" for PageSpeed and
threw when pressed: no workflow, no cron job, and a hook allowlist that
refused the key. PageSpeed is off the observation-source list; the
section says it is read only on an operator's own check, and a test
proves every listed source has a declared workflow behind its schedule
key (CODE-75, from MEAS-18).

## 0ba. The breadcrumb names the page you are on, 2026-09-02

The trail stopped at the category on every nested view and read labels
off the URL outside the categories. `src/lib/breadcrumbs.ts` now builds
one crumb per path segment from names a person wrote: the category
model, the sidebar's own labels, a short view-title map, and a kind word
for a row under a list. The ancestor is always a link and the current
crumb is the page the operator is on; a test walks every route file and
fails when a segment has no name (CODE-74, from NAV-8).

## 0az. The nightly proposal job frees a page once its change is decided, 2026-09-02

`propose-from-evidence` used to exclude any page that had ever carried a
change request, whatever its state, so one rejection silenced a page for
good. It now skips a page only while a change on it is proposed, approved,
or live inside its measurement window, by the same in-flight rule the
approval control uses; rejected, rolled-back, verified and fully measured
changes leave the page open again (CODE-73, from AGT-9).

## 0ay. "0 min saved" reads as the absence it is, 2026-09-02

Every rule writes `time_saved_minutes: 0` because nothing estimates it,
and the screens rendered the zero as a measurement. It now reads "Not
estimated" on the detail page, is omitted from the list line, and is no
longer projected by the MCP read; a typed seed figure still shows as
minutes (CODE-72, from AGT-4).

## 0ax. Stored states read as words, 2026-09-02

Every state pill replaced underscores and capitalised every word, so
`awaiting_approval` read "Awaiting Approval" and `unknown` read "Unknown"
for a connection nobody had checked. A label map now covers every
database enum, exhaustively and checked, plus the text states the
screens render; the pill and the eight hand-replaced sites read it, and
a caller's own phrase passes through unchanged (CODE-71, from COPY-1).

## 0aw. Who links to the rivals and not to you, on a click, 2026-09-02

The competitor link intersect existed as defaults and nothing else. One
Backlinks domain-intersection request across every approved competitor,
with the owned site excluded, now runs on an operator click on the
competitors page with the estimate shown; the snapshot is stored, read
back by a pure parser, and the page lists the sites linking to all
tracked competitors and not to you, saying when the read was made and
when it filled its limit. It files nothing and tracks nothing (CODE-70,
from LINK-4).

## 0av. The two declared agents that could not run are gone, 2026-09-02

`growth.analyst` and `content.strategist` were registry declarations
rendered at `/agents` as if they could be run, while the agent runtime
throws on every call and the runner refuses any graph with an agent
node, so their two workflows were unrunnable by construction and both
pinned a model slug the model layer exists to avoid. The declarations
and the two agent rows are gone; the two workflow rows stay paused
because each carries two recorded runs, and run history is not deleted.
The two pending capabilities they referenced stay declared as pending.
A declaration returns the day the runtime does (CODE-14).

## 0au. The five public hooks are tested at the handler, 2026-09-02

The scheduler tick, the nightly proposal job, the DataForSEO postback and
the two OpenAI Ads bridges were covered at the helper level and not at
the handler a caller reaches. Five tests now call each route's POST
handler directly: the missing or unverified token, the schedule outside
the allow-list, the hash-only token lookup, the body about another task,
the unknown tenant and wrong secret answering alike, the unconfigured
bridge, the empty-batch health checks, the exact work each hook hands on,
and the bare failure a thrown handler returns (CODE-69, from CQ-5).

## 0at. Route searches the approved set does not name, 2026-09-02

The tracked keywords are forty synonyms of one head term and no route
query, while the route-matrix operators compete on route queries. The
targeting pass now files one finding when no approved keyword names a
journey and Search Console has already recorded route searches reaching
the site, listing those searches with their impressions and clicks for
the operator to choose from. It invents no keyword and approves nothing
(CODE-68, from COMP-1).

## 0as. A schedule is claimed before it runs, 2026-09-02

Two ticks that both read a schedule as due both ran it. The tick now
claims the row with a conditional update on the very `next_run_at` it
read, so whichever tick moves the row first owns the run and the other
runs nothing and says so (CODE-67, from CQ-2).

## 0ar. A connection's health says when it was checked, 2026-09-02

Connector health is probed on a click, and the ledger card showed the
health and the probe outcome with nothing about when that probe ran. The
readiness projection now carries the check time, only when a probe
stands behind the health, and the card prints it beside the outcome
(CODE-66, from MON-20).

## 0aq. Google Ads spend is shown against its budget, 2026-09-02

The campaign-day report stored spend and conversions and nothing about
the ceiling the spend runs against. The query now selects the campaign
budget, the row keeps it (null when the API reports none, never 0) and
the measurement page shows "budget $X a day" beside each day's spend.
Nothing here changes a budget; the ceiling is set in Google Ads
(CODE-65, from PAID-1).

## 0ap. Authority rules read only what exists, 2026-09-02

Ten authority rules were declared; the evaluator supplies observed ranks
from stored Search Console rows and nothing else, so eight could never
fire. They are gone with their inputs and tests. The two that read what
exists stay: a single observed rank is not ranking capacity, and a
top-ten rank with no satisfaction measure names the missing measurement
(CODE-64, from CONTENT-4).

## 0ao. Backlink authority is not scored, and the card says so, 2026-09-02

A seven-factor "health score" sat on the backlink evidence pass with
every factor hard-wired to null, so it answered "insufficient" forever,
and the Essentials authority card read that back as a stored verdict.
The scaffold is gone. The evidence pass records which collections came
back empty and nothing else about health; the card says nothing in AOOS
scores backlink authority and shows the stored sample (CODE-63, from
LINK-1).

## 0an. Publishers that rank alongside you are no longer hidden, 2026-09-02

The SERP-derived classifier's "surface" list mixed general web platforms
with nine moving-niche publishers and marketplaces, so moveBuddha,
Moving.com and move.org, which the research log names as the route-matrix
rivals, were filed as surfaces the competitor screen never presents. The
list holds general platforms only now; what a business is stays the
operator's declaration in `company_classification`. The four derived rows
were corrected live, and the badge says "Ranks alongside you" rather than
"Business competitor" (CODE-62, from COMP-2).

## 0am. Keyword discovery files what it found, 2026-09-02

Suggestions and gap keywords under ten monthly searches were discarded
before an operator saw them, a number no doctrine names, and a candidate
with no volume figure was read as zero and dropped too. Nothing is
filtered on volume now: candidates are ordered by volume with unknown
volumes after the known ones, the per-run cap files the top of the list,
and the run result counts what the cap left, what had no figure and what
was irrelevant to the seeds (CODE-61, from CONTENT-1).

## 0al. A schedule the tick cannot run fails, 2026-09-02

The tick recorded any schedule whose target was not a workflow as
succeeded without doing anything. It now throws, so the firing is written
down as failed with the reason and the row's health turns failing. No
live row has another target kind today (CODE-60, from MON-21).

## 0ak. A mention without a link is now a finding, 2026-09-02

Brand-mention snapshots and referring-domain snapshots were both stored
and never compared. The fifth discovery rule,
`brand_mentioned_without_a_link`, files one finding per domain that names
the brand and is absent from the newest referring-domain read, leaving
out owned hosts and known competitors. The claim is exactly what was
compared: a referring-domain read that filled its limit yields "not among
the first N linking domains by rank, which is where the stored read
stopped". Without both reads the rule names what it is waiting on and
files nothing (CODE-59, from LINK-3).

## 0aj. One Command center, 2026-09-02

`/command-center` kept the legacy overview, eight count tiles and spend,
capability and run lists that showed a zero on a first run or a failed
read, while `/` states an absence as an absence; the navigation linked
only `/`. The old route now redirects to `/`, and the legacy page, its
server function and its reads are gone. The `command_center_overview`
database routine stays with no caller (CODE-58, from NAV-1 and STATE-1).

## 0ai. Scheduler firings are durable, 2026-09-02

`cron.job_run_details` says "succeeded, 1 row" for every firing because
the job only queues an HTTP request, and the HTTP outcome is kept for
hours; the schedule row keeps only its last state, so the days the tick
answered 500 left no trace. `schedule_runs` now keeps one row per firing:
who fired it, state, duration, error and the workflow run it started,
written by the tick for every claimed or blocked schedule and by the hook
when the tick throws before claiming anything. The schedule page lists
them. The two schedule rows that disagreed with their cron entries by
five minutes now say the minute that actually fires (CODE-48, from MON-3).

## 0ah. SERP tasks carry every surface on the page, 2026-09-02

Every SERP task was posted and retrieved as `regular`, which returns
organic and paid items only, so featured snippets, People also ask, AI
overviews and local packs never reached the stored rows and the competitor
second pass could not name them. Tasks are now posted and retrieved as
`advanced`, on the scheduled path, the backlog sweep and the live
inspection alike. Rank still reads organic items only; the other item
types are the surfaces on that SERP, and the competitor profile's
"surfaces involved" line fills from the next observation on. The provider
bills per SERP, not per result type (CODE-57, from COMP-4).

## 0ag. Two failures now reach the Inbox, 2026-09-02

The nightly proposal job pauses itself on a terminal configuration
failure and used to record that only on its own row, which no screen
reads; a failed or refused governed commit or revert was stored and shown
only in the change page's history. The job now files one needs-attention
item the night it pauses and resolves it the night a probe succeeds; a
failed or refused source attempt files one open item per change, naming
the reason, and a later attempt that lands closes it (CODE-56, from MON-9
and MON-10).

## 0af. The coverage page says evaluation is not built, 2026-09-02

Fifty-four concerns, fifty-four templates, zero evaluations ever: two
readers and no writer. The coverage card said "no evaluation has been
stored yet", which implied an evaluator waiting to run. It now says that
nothing in AOOS grades a concern, that the page tracks who owns each and
when it is due, and that it makes no claim about whether one is working.
The next-actions read of the empty table is gone; the coverage read and
the model stay for the day an evaluator exists (CODE-43, from DB-9).

## 0ae. A verdict shows the confidence it rests on, 2026-09-02

The verdict module already computed a confidence for every count-based
grading and used it only to force a low-confidence reading to neutral, so
a success resting on a 0.4 rendered exactly like one resting on a 0.9.
The assessment now carries the confidence on the success, failure and
low-confidence-neutral branches; the graded reading carries it through;
and the change page and the site health outcomes tab print "Confidence N%
(band)" under the reason, and nothing where no comparison was made
(CODE-55, from MEAS-7).

## 0ad. A blocked SEO run says why, 2026-09-02

All six stored SEO runs were `preflight_blocked` with no reason on the
row: the preflight result went to the run's event payload and nowhere the
run screen reads. Two of the six blocked on the cloud Firecrawl connection
being pending while the self-hosted renderer, which every page proof and
competitor observation already uses, sat real and healthy beside it. The
server now writes the reason to the run, the preflight accepts the
self-hosted renderer as a stand-in for the cloud one, and migration
`20260902080000`, applied live and ledgered, backfills the six reasons,
lets `change_type` carry the lane's current name (`page_wording`), and
moves the rows (CODE-44, from DB-11).

## 0ac. Search Console attempts are ledgered like every other provider's, 2026-09-02

A failed Search Console observation reached `capabilities.health` and an
Inbox item, and nowhere the operator looks first: the cadence card reads
`measurement_runs`, and the Command center counts a provider as failing
from its newest run, and Search Console never wrote one (the CHECK on
`provider` did not admit it). Migration `20260902070000`, applied live and
ledgered, admits `gsc`; `run-ledger.server.ts` opens a row with service
credentials before Google is touched and closes it with the outcome, in
the manual observation and in the scheduled collection node alike, and
closing the row can never mask the failure it records (CODE-54, from
MON-5).

## 0ab. Two monitoring controls that could only read well, 2026-09-02

The cadence card had no word for a scheduler that silently stopped: a row
whose `next_run_at` was days in the past still read "Cadence on" while its
last stored run carried no error. It now reads "Cadence overdue" once a
whole further cron period has passed after the row's own expected firing
with no run recorded, a threshold taken from the schedule itself rather
than chosen. The Command center's "All systems normal" was derived from a
`tool_systems` column nothing ever sets to "failed", so the light could
only be green; it now counts connections whose probe wrote `failing`, and
until at least one connection has been probed it says "Connections have
never been checked" instead of claiming they are fine. The next-actions
"broken systems" count reads the same rows (CODE-53, from MON-2 and MON-4).

## 0aa. The GA4 rules say which of them ran, 2026-09-02

Twenty-seven successful GA4 rule runs recorded `observations: 0` and
nothing more, so the findings panel could not tell "one rule ran and
nothing qualified" from "three rules never ran because no prior snapshot
existed" (CODE-47). The evaluator now returns the rule keys it evaluated
and a sentence for each reason a rule could not run; the daily runner
carries both into the `ga4.rules` step output; and the findings panel reads
the latest stored step and prints them above the list, the way
`unmetPrerequisites` already does for the Search Console rules. A run
recorded before the words existed renders as having none.

## 0z. A finding carries no impact it never estimated, 2026-09-02

Every rule module wrote its business impact three times: once as the
business impact, then again as the revenue impact and the traffic impact.
111 of 115 findings read "revenue: high" or "traffic: medium" on the
strength of nothing, on the list, on the detail page, and through the MCP
tools; no revenue evidence is collected anywhere and no rule estimates
traffic (AGT-3 in the review; CODE-51). The nine modules no longer write
the two columns; migration `20260902060000`, applied live and ledgered, put
the 111 copied rows back at the default and left their ids on an activity
event; the default now renders as "Not estimated", the list shows a
traffic or revenue pill only when a stored estimate exists, and the MCP
projections stop exporting the two columns. Three seeded rows and one
hand-set Search Console row keep the values they had.

## 0y. Applied means proven live, and there is no other way in, 2026-09-02

The manual "Mark applied" button left the screen on 2026-08-21, but the
action it called did not leave the database: `transition_change_request`
still accepted `mark_applied` from any operator, approved to applied with
no rendered proof (AGT-2 in the review; CODE-7). Every real application
has gone through `apply_change_request_rendered_proof`, and no applied row
lacks a proof, so nothing stored changes. Migration `20260902050000`,
applied live and ledgered, makes the routine refuse the action by name;
the wrapper server function, the action type and the `approved` row of the
state matrix are gone with it, so the pure state module and the database
say the same thing: an approved change moves forward only when the
rendered public page carries the exact approved wording.

## 0x. The bridge secret is the one the caller's connection names, 2026-09-02

The two OpenAI Ads bridge hooks verified every caller against one global
variable and then let the payload choose the tenant by slug, so any
tenant's caller could have written another tenant's events; they also
advertised CORS to every origin with the secret header allow-listed, an
invitation to a browser caller that would ship the secret (CODE-37).
Migration `20260902040000`, applied live and ledgered, adds
`bridge_secret_name` to the connection row, naming the server variable
that holds its bridge secret the way `secret_name` names the provider
credential; the default is the variable in use today, so the website and
the live bridge are unchanged. Both hooks now resolve the tenant from the
slug first, verify against that tenant's variable, and answer an unknown
tenant and a wrong secret alike. The CORS surface is gone: the only caller
is the website's server-side function. The connection settings screen shows
the bridge secret's name and whether the host carries it, beside the
provider credential it already showed.

## 0w. A scheduled run works for the tenant its schedule names, 2026-09-02

The scheduler ran every workflow through the service-role client and let
`requireTenantId` resolve the tenant from that client, which sees every
profile: the answer was whichever account's active workspace sorted first,
cached for the process lifetime. With one tenant that was invisible; with a
second it would have written every scheduled observation to the wrong
workspace (CODE-50, from AGT-1 and CQ-1). Now the service-role client
resolves a tenant only from an explicit id or the sole tenant, and caches
nothing; a workflow schedule names the tenant it runs for and is refused,
with the reason on the activity feed, when it names none; the run carries
its own `tenant_id` to every node instead of re-resolving it; and the
selected Search Console property is read by tenant. The four `sch.*`
template schedules with no tenant are all disabled, so nothing changes for
the four jobs that run today.

## 0v. A callback is authenticated by something only the task knows, 2026-09-02

Migration `20260902030000_postback_token_and_shared_rows.sql`, applied live
and ledgered, closes CODE-34 and CODE-36. The DataForSEO Standard-queue
postback had been authenticated by the project's publishable key, which
ships in the browser bundle: any caller who read it passed the gate and
triggered a service-role lookup. Each task now carries its own random
token in the postback URL; the table stores the token's SHA-256 and nothing
else; the receiver hashes what it is handed, finds the task by hash, refuses
a body that is not about that task, and answers every refusal with the same
401 (`src/lib/dataforseo/postback-token.ts`, pure and tested). No task was in
flight at the switch. No rate limit was added, because its threshold would
be an invented number.

Audit rows with no tenant were readable by every authenticated account
because `is_tenant_member(NULL)` is true by design for shared rows. The read
policy on `activity_events` now distinguishes the two cases (a row with a
tenant reads for its members; a row without one reads for admins and its
own actor or subject), the write policies on the three tables that hold
shared rows require the admin role for a row with no tenant, and the auth
and MCP audit writers file the operator's active workspace on the row.

Corrected on the way: the OP-11 claim of seven `USING (true)` registry read
policies was stale; the live catalog holds one, on
`essential_concern_templates`. The sign-up decision still stands.

## 0u. Membership is not authority: the database-side pass, 2026-09-02

Migration `20260902020000_membership_is_not_authority.sql`, applied live and
ledgered the same day, closes the database half of the 2026-09-02 review
(CODE-35, CODE-38, CODE-39, CODE-40, CODE-41, CODE-42, CODE-45). Approval now
locks every lane: the immutability guard fires on the state alone rather
than on the lane's old name, so the five approved page wording rows and the
page metadata row can no longer be rewritten after approval. The revise
routine accepts the lane it serves (`page_wording`), which it had refused
since the rename, so Edit and Regenerate on a draft can now write a version
row for the first time. Every routine that took an actor from its caller
binds it to the session when there is one; the null-actor system path is
the server's. Membership alone no longer advances a workflow run, reassigns
a concern, seeds concerns, or records an audit row: each asks for the
operator role. Provisioning creates the tenant membership it never created,
the allow-list names the workspace an entry joins, and a profile can only
point at a workspace the account belongs to. The three vendor schedules that
read "on" with nothing behind them are off, with the reason on the activity
feed. The anon role holds no table privilege in `public` and the REST API
answers 401 where it answered 200 with an empty list.

Two migrations in this directory had never run, found while repairing the
ledger: the trigger widening in `20260819213000` and the windows CHECK in
`20260820200000`. The second was a break waiting to happen: the live
trigger inserts 56 and 90-day windows that the live constraint refused, so
the next rendered proof would have failed inside the proof routine with five
approved changes waiting on it (CODE-49). Both effects are re-issued here.
Every hand-named migration file now has a ledger row; those two are named
superseded and must stay ledgered, because replaying either would break.

Still open from the review: the postback authenticated by the public key
(CODE-34), audit rows with no tenant (CODE-36), the Ads bridge secret
(CODE-37), the unbuilt concern evaluator (CODE-43), the blocked SEO runs
(CODE-44), the Vercel origin (CODE-46), GA4 observation reasons (CODE-47),
scheduler outcome durability (CODE-48), and the operator decisions in
OP-11.

## 0t. Security review, first hardening pass, 2026-09-02

A ten-lens gap analysis ran on 2026-09-02 (security and tenancy, database
drift, measurement, technical SEO, agent runtime, navigation, code quality,
documentation, growth capabilities, monitoring); its digest is filed at
`docs/handoffs/2026-09-02-gap-analysis-digest.md`, pre-refutation, and every
finding not closed in this pass has a backlog ID. Closed here, all
application-level and covered by tests: the two streaming model routes and
the next-actions re-ranking now require the operator role rather than any
valid session (sign-up is open on the auth project); the page audit requires
the operator role; the five public hooks compare their secret in constant
time; the three hook failure bodies no longer echo the error, so a public
caller cannot learn which environment variable a host lacks; and the
execution readiness read discloses credential presence only after
authentication. `TENANCY_PERMISSIONS.md` carries the same record.

Not closed here, recorded as CODE-34 through CODE-48 and OP-11: the
database-side hardening (migration ledger, the immutability trigger that
guards only the old lane name, the revise function that refuses the lane it
serves, membership-only write paths, provisioning without membership, the
anon role's default privileges), the postback authenticated by a public key,
and the operator decisions (close sign-up, the Vercel origin).

## 0s. A page's own description is now a governed edit, 2026-09-02

CODE-33, opened and closed the same day. The `page.metadata` change kind now
owns the page sources already governed under `page.wording`; the database
proof allowlist already listed every one of them, so the executor and the
proof routine still agree file for file. `selectMetadataSource`
(`page-metadata-proposals.ts`, six tests) binds a description edit to the
page's own file when that page renders its own `SeoHead` description, and to
the shared head component or the sitewide default only when the page leaves
the description to them. It refuses, naming both values, when the page's
source and the live page disagree, and refuses an expression it cannot
replace exactly. The execution readiness card names every kind that may write
a file (`changeKindsForFile`) rather than the first one it finds. The homepage
description, unreachable since 78fc8c5e, can be drafted against
`src/pages/Index.tsx` again.

## 0r. Changes waiting on one publish are one Inbox item, 2026-09-02

CODE-31, the rollup half. Four approved changes sat committed and unproven
while the operator learned they all waited on the same publish by asking.
`publish-wait-rollup.ts` (pure, tested) selects approved changes that carry a
commit and no published proof and, from two upward, words one item naming the
count, the shared blocker and how long the oldest has waited.
`reconcilePublishWaitRollup` keeps exactly one open needs-attention item per
tenant for the group: it is filed when the group first reaches two, rewritten
in place when the group changes, completed when it shrinks below two, and a
hand-cleared item is not reopened for the same group. It runs after the daily
Search Console observation and after every "Check the live page" click.

## 0q. Every registered rule now says why it has no draft, 2026-09-02

CODE-1, re-measured. The 18 rules the backlog named already had a written
reason by 2026-08-31; what actually fell through to the generic "no governed
fix for this finding yet" sentence were the 15 rules the four rule sessions
registered that day (crawl errors, redirect chains, non-indexable pages, the
two duplicate-across-pages rules, the three backlink rules, the three Umami
rules, the two discovery findings and the two ownership candidates). Each now
carries its own sentence in `finding-fix-target.ts`, grounded in what the
rule measures and pointing at the real lever (hosting and routing, the
tracking tag, a provider read on a click, a judgement the operator owns), and
`finding-fix-target.test.ts` walks `RULE_ASSIGNMENTS` so a rule registered
without a reason fails the build instead of rendering the generic line.

## 0p. A description edit refuses a page that sets its own, 2026-09-02

CODE-30, the drafting half. The homepage change 78fc8c5e edited the sitewide
default in `DefaultSeo.tsx` and never reached the live head because
`src/pages/Index.tsx` passes its own description to `SeoHead`, and the
prerender emits Helmet's resolved tags (not the static `index.html` head the
earlier note suspected). `preparePageMetadataProposal` now reads the target
page's own governed source at the same revision and refuses, naming the file
and the sentence it sets, before any wording is drafted
(`findPageOwnedDescription` in `page-metadata-proposals.ts`, four tests). The
refusal is honest and also a gap: no lane can edit a page-level description
yet, recorded as CODE-33. 78fc8c5e itself stays approved, committed and
unprovable until the operator rejects or rolls it back.

## 0o. Approving a second change to a page now names the first, 2026-09-02

CODE-31, the approval half. `transition_change_request` refuses `approve`
while another change to the same page is approved and not yet live, or live
with a measurement window whose rows are not readable yet, unless the call
carries an explicit acknowledgement; the acknowledgement lands on the audit
event as the sibling's id. The change page reads the same rule before the
click (`src/lib/change-request-conflicts.ts`, a pure module with tests) and
replaces the plain Approve control with "Approve anyway, measure both
together" while a sibling is in flight, with the consequence stated beside it.
Migration `20260902010000` is applied live and registered in the ledger; the
old four-argument overload is dropped so the RPC stays unambiguous.
`VALIDATION_GATES.md` gained the Concurrency gate.

Not done, recorded rather than implied: the needs-attention rollup for several
changes sharing one blocker, and the two pre-existing duplicates on the queue,
which the guard does not retroactively resolve.

Also applied live in this pass: `domain_ownership_candidates`
(`20260831120000`), which the merged discovery workflow writes to and which
did not exist in production until today.

## 0n. Where production actually builds from, 2026-09-01

Read this before believing any "Verified 2026-08-31" or "2026-09-01" closure
below: **none of it is live.** Since 2026-08-30 the Lovable project that serves
`trumove.marky.systems` has synced to `maxwest525/trumove-resource-center`, not
to this repository. Everything merged here from PR #89 through PR #103 (the
four rule sessions, the spend ceiling, Google Ads reporting, the publish-proof
fix, the contradiction pass, the breadcrumbs) exists on GitHub `main` and
nowhere else. OP-10's "stuck pull" reading is withdrawn; the bridge is
disconnected, not stuck. A Vercel project was imported on 2026-09-01 and
serves GitHub `main` at `synergy-layer.vercel.app`, but it holds no server
secrets and no schedule targets it, so it is a shadow, not production.

The evidence, the measured divergence (26 commits here, 11 in the mirror, one
merge conflict), the step-by-step plan with a rollback per step, and the
single-repository decision the operator has to make are in
[`DEPLOYMENT_TOPOLOGY.md`](DEPLOYMENT_TOPOLOGY.md). `PROJECTS.md` now carries
the warning too.

Also landed in this change: the Lovable-side `optimizeDeps.exclude` fix for
the TanStack prebundle hang (mirror commit `77e2578`, 2026-08-30) is ported into
`vite.config.ts`, and Lovable's `20260831113553` migration file for
`google_ads_snapshots` is kept verbatim beside this repository's idempotent
`20260831210000`, because the live migration ledger names the former.

## 0m. The self-contradiction pass, and every page gets a way back, 2026-09-01

The operator put four screenshots side by side and the platform argued with
itself on every one. Each contradiction traced to code, not data, and each is
closed:

- **A loop is no longer "stalled" at a stage its own numbers prove was
  passed.** `loop-state.ts` flagged the first zero-count stage and claimed
  "the loop cannot reach the stage after it" while the stages after it showed
  5 approved and 1 in flight. A stage now stalls the loop only when nothing is
  recorded at it or after it; an empty stage the loop demonstrably moved past
  is a named gap ("holds nothing right now, while later stages carry stored
  work"), drawn dashed, and the loop reads Turning. The "N of M loops
  complete" badge now says what it counts: "N of M loops stalled".
- **The PageSpeed instruction now reads the error it quotes.** "Fix the page
  speed provider key" sat above a stored 429 naming a daily quota of zero on
  the provider's own Google Cloud project, for an API that answers without a
  key. The instruction and the blocker line are derived from the stored error
  (quota errors say to fix the quota in the Cloud console), and the circular
  "Blocked by: the last provider attempt failed" is gone - the blocker names
  the external fix and says one successful measurement clears it.
- **"Nothing is currently waiting on a decision" no longer renders beside 58
  waiting recommendations.** The draft-a-change card's sentence is scoped to
  what its rule actually checks: no page change proposed. The decisions loop
  stage is likewise relabelled "Page change proposed", because it counts
  change_requests and nothing else.
- **A row nothing can act on cannot age its way to the top of Marky assist.**
  "Enable the research capability" ranked as the biggest win for 27 days
  while its own detail page said approving it records a decision that runs
  nothing. `urgencyFor` now pins `actionable: false` rows at nice-to-have;
  the Command center computes actionability from the single source of truth
  (`recommendation-action.ts`, a drafted change, or a governed fix lane).
- **Seeded scores are no longer presented as measurements.** The 2026-08-04
  seed rows carry hand-written confidence (85%) and time-saved (240 minutes)
  figures no code derives; the recommendation detail page now says exactly
  that instead of rendering them beside the derived-confidence findings.
- **Every page has a way back.** `breadcrumbsForPath` returned an empty trail
  for any route outside the six categories - the breadcrumb bar blanked on
  exactly the deep pages an operator gets lost on - and the crumbs it did
  return rendered as dead text. Every route now gets a trail through the
  Command center, ancestor crumbs are links, and the top bar carries a Back
  control on every page but home.

Still open from the same screenshots, filed rather than done: one shared
definition of "waiting" across Command center, the loops, and next-best
actions (CODE-32); the approval-time duplicate guard and shared-blocker
rollup (CODE-31).

## 0l. Corrections from live evidence, and publish proof reads the page itself, 2026-09-01

Three stale claims in this file and the backlog were contradicted by the live
database and the live site, checked 2026-09-01. Recorded per SOURCE_OF_TRUTH
(live production first), because each one sent the operator chasing a fix that
was not theirs to make.

- **The executor token has been configured and working since 2026-08-11.** The
  "Still blocked" bullet below saying `GITHUB_EXECUTOR_TOKEN` is not configured
  is wrong and stands corrected. `change_request_executions` holds preflights
  reading "Proved with the configured token" (2026-08-11, 2026-08-14) and real
  commits to the website repository on 2026-08-14, 08-25, 08-28 and 08-29, each
  with its SHA and replacements recorded. One change (6aa5a3b1, corporate
  relocation) completed the full pipeline to applied on 2026-08-14.
- **The prerender is live in production.** Measured by direct curl 2026-09-01:
  the homepage returns 243,067 bytes with `#root` fully populated, and
  `/services/corporate-relocation` and `/research` serve real per-route H1s in
  the raw HTML — including the approved values of committed changes 26725aea
  and f8feacee. This supersedes CODE-24's 2026-08-31 empty-shell measurement
  and closes the deploy half of OP-9. Still true: an unknown path returns 200
  with the homepage bytes (soft-404), tracked in the backlog.
- **Publish proof was failing for the platform's own reasons, not the
  operator's.** The proof renderer chain had Crawl4AI answering HTTP 401 on
  all 34 requests of 2026-08-30 — it was clean through 08-29 02:35 UTC, and
  nothing has rendered since, so the outage is bounded to that day and the
  operator's green health probe on 08-31 suggests it recovered (CODE-29 holds
  the exact bounds) — and its Firecrawl fallback reported the
  research page as "an unrendered application shell" while a plain fetch of
  the same URL served the approved H1. Fixed in this change: publish proof now
  reads the page's own prerendered HTML first, at no charge and with no
  credential, with Crawl4AI-then-Firecrawl kept as the JavaScript fallback for
  client-only routes (`createDirectFetchVerifier` in
  `src/lib/execution/execute.server.ts`, source loop in `checkPublishedPage`,
  contract updated in `docs/execution-handbook/EXECUTION_ROLLBACK.md`). A
  pending verdict now describes the page a source actually saw rather than a
  broken renderer's shell. The three committed-and-live changes should each
  flip to applied on one "Check the live page" click.
- **One change can never prove as targeted.** The homepage meta-description
  change (78fc8c5e) edited `DefaultSeo.tsx`, but the live homepage head serves
  the same old sentence from a different source in the website repo, so the
  edit is committed, deployed, and invisible. That is a proposal-targeting
  defect (CODE-30), not a publish failure.

## 0k. Google Ads reports real campaign data, 2026-08-31

CODE-28 in `BACKLOG.md`, closing the reporting half of OP-1. Until now
`google-ads.server.ts` did one thing: prove OAuth/developer-token access via
`customers:listAccessibleCustomers`. It now also sends a GAQL
`googleAds:search` query for campaign id/name/status/channel type plus
impressions, clicks, cost and conversions, segmented by day over the trailing
30 days, and upserts the rows into `google_ads_snapshots` keyed on
`(tenant_id, customer_id, campaign_id, segment_date)` -- a rerun corrects that
day's numbers rather than duplicating, since Google Ads attributes
conversions for several days after the click.

- New pure module `src/lib/measurement/google-ads.ts` (GAQL builder,
  normalizer, connection-state description) and server module
  `src/lib/measurement/google-ads.server.ts` (token acquisition, fetch,
  upsert, a `measurement_runs` row per attempt) -- mirrors the GA4/PageSpeed
  measurement pattern already in this directory.
- `refreshGoogleAds` server function and a Google Ads card on
  `/measurement/tools`, gated behind `assertOperator` like every other
  provider refresh. One click, one report, no schedule.
- `growth-operations.ts`'s `google.ads` capability gained a
  `campaigns.report_read` operation and dropped `campaign_reads` from its
  `prohibited` list; budget/bid/ad writes stay prohibited.
- `connections.ts`'s `google_ads` entry moved off `table: null` -- it used to
  be this file's own example of "a credential with no code behind it."
- `essentials.tsx`'s Google Ads concern now reads real stored-row counts
  (`data.googleAds`) instead of a hardcoded "nothing stored" sentence.
- **Stated gap, not silently missing:** `google_ads_snapshots` already
  existed live in the database with zero rows and no migration file behind
  it -- the same undocumented-drift shape CODE-9 found elsewhere. A catch-up
  migration (`20260831210000_google_ads_snapshots.sql`) now matches the live
  schema. No rule module reads this table yet, so a stored campaign-day row
  does not yet become a finding; negative keywords and Keyword Planner remain
  unbuilt. 10 new tests, 1624 total, typecheck clean, lint 0 errors.

## 0j. Competitor discovery findings reach the operator, 2026-08-31

Session D of the four-way parallel rule build
(`docs/handoffs/2026-08-28-parallel-rule-sessions.md`, CODE-6 in
`BACKLOG.md`). Labs (`competitors_domain`), Domain Analytics (whois,
technologies) and Content Analysis were all collecting snapshots nothing
read; four rules now do, on `discovery-rule-checks.ts` (pure) and
`discovery-findings.server.ts` (writer, `source_module: "competitor-discovery"`
— never `"dataforseo"`), wired to a new manual workflow
`dfs-discovery-findings` (`registry/modules/competitor-discovery.ts`). Costs
nothing to run: it re-reads stored snapshots, calls no provider.

- `overlap_list_reached_the_row_limit` and `rival_page_mentions_your_brand`
  write `recommendations` like every other fact rule.
- **The other two are not findings.** `same_registration_details_across_two_known_domains`
  and `identical_technology_stack_across_two_known_domains` file a `pending`
  row in a new table, `domain_ownership_candidates`, for the operator to
  confirm or reject — same shape as `ad_advertiser_candidates`. Nothing writes
  `confirmed` or touches `company_classification` from a match; only an
  explicit operator action would, and that action does not exist as a UI yet
  (`CODE-27`). See `COMPETITIVE_MODEL.md` §4 for the full lifecycle.
- **Still a documented gap, not silently missing:** `collectWhoisOverviewForKnownDomains`
  is written and tested but has no caller — no workflow node, no operator
  button — so the whois-match rule stays correctly silent
  (`whois_collection` prerequisite unmet) until one is built.
- Four new non-volume `Prerequisite` members (`whois_collection`,
  `technology_collection`, `brand_mention_collection`,
  `reviewed_competitor_set`) in `rule-buckets.ts`, so an empty competition
  screen would eventually name what it is missing rather than blaming volume.
  The three existing screens that already call `unmetPrerequisites` (Your
  pages, Site health, Getting found) pass `true` for all four: none of them
  reads discovery evidence, so those screens say nothing about it rather than
  guessing.
- Fixed in the same change: `workflow-runner.server.ts`'s brand-term
  derivation for `cap.dataforseo_content_analysis` stripped a domain's TLD but
  left a leading `www.` on, so every mention search for a `www.`-form target
  searched for the wrong word.

## 0i. Umami rule engine reaches the visitors category, 2026-08-31

Session C of `docs/handoffs/2026-08-28-parallel-rule-sessions.md`. `cap.umami`
had been `real` since 2026-08-18 (see 0d) with `umami_snapshots` rows stored
and no rule reading them, so `visitors` was a category with no Umami finding.
Three of the doc's rules shipped, each with every required adversarial-review
correction applied: `umami_zero_recorded` (renamed from the proposed
`umami_tracking_silent`), `umami_site_traffic_shift`, and
`umami_referrer_source_stopped`. `umami_page_traffic_shift` and
`umami_recording_stopped` stay killed, as the doc requires.

- `src/lib/umami-rule-checks.ts` (pure, fully unit-tested),
  `src/lib/umami-rules.server.ts` (writer), `src/registry/modules/umami-findings.ts`
  (registry module) — new. `evaluateUmamiSnapshots` runs inline at the end of
  `observeUmami` (`src/lib/umami/observe.server.ts`), mirroring how
  `evaluatePageSpeedReadings` runs at the end of the PageSpeed read: a rules
  failure never fails the observation itself.
- `src/lib/rule-buckets.ts` gained a new `umami_second_window` prerequisite
  (deliberately not a reuse of `second_collection` or `analytics`, both wired
  to other providers' facts) and the three rule assignments. The three
  call sites that build a `PrerequisiteState` (`your-pages.ts`,
  `site-health.ts`, `getting-found.ts`) pass `umamiSecondWindow: true` as a
  stated placeholder, the same pattern already used there for
  `urlInspection`/`approvedKeywords`/`backlinkCollection` — none of them
  reads Umami yet, so the field is honestly a stub, not a real check.
- `connections.ts`'s `umami` entry now claims `findingSources: ["umami"]`.
- `umami/client.server.ts`'s `fetchUmamiMetrics` slice-to-25 default is now
  `UMAMI_RULE_THRESHOLDS.referrer.appSliceLimit`, read from the same object
  the rule's completeness guard reads, instead of a hand-copied `25`.
- `docs/integrations/umami/DIGEST.md` gained the verified provider default row
  limit (500) for `GET /api/websites/:id/metrics`.

**Inert today, honestly:** as of 0d there is exactly one stored Umami run (four
rows, 2026-08-18, all real zeros). `umami_site_traffic_shift` and
`umami_referrer_source_stopped` both need a second, non-overlapping stored
window before they can fire at all — on the daily 28-day cadence that is
roughly day 29 of collection — and the pending capability-promotion migration
(0d) still has to be applied before the daily job even runs. `umami_zero_recorded`
can fire today once that migration applies, on the existing four rows.

**Not done, flagged in the PR body:** `finding-router.ts`'s `CATEGORY_BY_RULE`
still lists the old `umami_tracking_silent` id, which no rule emits any more;
harmless because `CATEGORY_BY_MODULE`'s `umami: "visitors"` entry routes all
three current rule ids correctly by fallback, but the stale entry is worth
deleting whenever that shared file is next touched.

## 0h. Subheadings surfaced, heading order deleted, 2026-08-28

The page audit parsed `h2Count` and `headingSkips` on every page and no check
read either: two signals collected on every run and shown to nobody. They are
resolved in opposite directions, deliberately.

- **`h2_missing` is now a check.** It fires only when a page has no `<h2>` at
  all AND is long enough for sections to mean something, reusing
  `THIN_CONTENT_WORDS` rather than inventing a second word count. Severity is
  `advice` and the copy makes no ranking claim, because no Google document
  requires a subheading. The reasons given are the documented ones: Google
  reads headings to understand how a page is organised, and unclear headings
  are an input to it replacing the title it displays.
- **`headingSkips` is deleted, not surfaced.** Google states plainly that "it
  doesn't matter if you're using them out of order". A rule on heading order
  would have manufactured findings Google's own documentation contradicts,
  which is the exact failure the no-invented-thresholds rule exists to stop.
  The field, its computation and its consumers are gone, and a test asserts
  the fact no longer exists on the parsed page.
- `PAGE_CHECK_FIX.h2_missing` is `null`: no governed change kind can edit a
  subheading yet, so the finding is reported and honestly has nowhere to go.
  The lane is tracked separately.

## 0g. PageSpeed reaches the operator, 2026-08-28

The fifth module that writes a recommendation. `pagespeed_snapshots` had
stored real Core Web Vitals readings since the measurement slice landed and
nothing read them: `findingSources` for `pagespeed_insights` was empty, so the
connector was pinned at "collecting and reaching nobody" no matter how many
runs it stored.

- `pagespeed-rule-checks.ts` (pure) and `pagespeed-rules.server.ts` (writer,
  `source_module: "pagespeed"`). Two rules: `page_lcp_poor`, `page_cls_poor`.
- **No threshold is invented.** The bands are Google's published Core Web
  Vitals values (LCP good at or under 2.5s, poor above 4.0s; CLS good at or
  under 0.1, poor above 0.25) and only the band Google itself calls poor
  fires. The needs-improvement band is deliberately silent.
- **The lab/field distinction is stated on screen.** The stored values come
  from `lighthouseResult.audits[].numericValue`, one simulated load. Google's
  page-experience signal and the Search Console Core Web Vitals report read
  field data from real visitors (CrUX). The copy says the reading is a test
  load and never claims the page fails Core Web Vitals.
- Both rules are bucketed `fact`: a direct per-page measurement answers at any
  volume, which makes these among the few rules this property's traffic can
  support.
- The rules run after each PageSpeed measurement; a rules failure never fails
  the measurement, because the snapshot is stored and immutable either way.
- `PAGESPEED_API_KEY` is now declared optional in the connector catalog,
  matching the code: the v5 API answers without a key, and a working keyless
  setup previously read as "not configured".

## 0b. Command center queue corrections, 2026-08-28

Three defects around the suggestion queue, fixed on this branch:

- **Rule-finding cards carry their page address again.** The Command center
  read hardcoded `targetUrl: null` for every recommendation row. It now reads
  the stored `suggested_action.target` through `pageUrlFromSuggestedAction`
  (`finding-router.ts`), which returns only a page URL: query terms, `site`
  and bare domains stay off the card, and the coverage-gap `page :: query`
  form is split the same way `deriveFixTarget` splits it.
- **Site crawl findings can draft their fix.** `siteSources` never carried the
  check id, so `verbsFor` could not offer "Draft the fix" even though
  `SITE_CHECK_FIX` maps `robots_blocks_site`, `robots_blocks_pages` and
  `sitemap_not_declared` to the crawl-directives lane and `proposeAuditFix`
  already accepted `scope: "site"`. The check id now travels on the row, the
  card dispatches those three to the site scope, and the verb carries its own
  copy (`DRAFT_SITE`): the site draft is deterministic, so it is not metered
  and says so. The other six site checks still offer no draft.
- **The lying "Run agent" button is gone.** `/agents/$id` offered a button
  whose server function unconditionally throws (`agent-runtime.server.ts`).
  Per the no-lying-controls rule it now renders a sentence saying agent runs
  are switched off in this build; `runReferenceAgent` keeps refusing
  server-side and no longer has a UI caller.

## 0c. Registry and workflow-runner integrity, 2026-08-28

Five related defects around "declared versus wired" were closed in one pass:

- **The runner refuses what it cannot execute.** `executeNode` in
  `src/lib/workflow-runner.server.ts` used to fall through for any capability
  key with no dispatch branch, stamping `last_run_at` and health "healthy" and
  returning success for a step that did nothing. An unmatched capability now
  fails the step with a named error. The same fall-through inside the
  DataForSEO handler (an unrecognised `cap.dataforseo_*` key reported the
  target as observed) now routes to the same refusal.
- **Two "real" claims corrected to `pending`.** `growth.opportunity_scanner`
  and `content.brief_builder` were declared `real` with no execution path in
  the runner; every run of theirs was the silent fall-through above. Both are
  redeclared `pending` per the `types.ts` rule "never claim more than is
  wired". No runtime behaviour changes: their workflows contain agent nodes,
  which `assertRunnableGraph` already refuses.
- **A forcing function now guards the seam.** `operational-bridges.test.ts`
  reads `workflow-runner.server.ts` the way `connections.registry.test.ts`
  reads its sources: every capability a registry workflow references must be
  declared by a module, and every reachable capability declared `real` must be
  dispatched by the runner. Declaring a capability real without wiring it now
  fails `npm test`.
- **`wf.seo_validation` no longer references an undeclared key.** Its first
  node referenced `cap.knowledge_retrieval`, which no module declares (it
  exists only in the 2026-08-04 seed migration) and no runner path executes,
  so the "load" step was a silent no-op. The node is removed; the workflow is
  the single real `seo.validation` step, and a registry-only rebuild is
  self-contained. The seed row for `cap.knowledge_retrieval` still exists in
  the database; any seed-era workflow that references it now fails with the
  named refusal instead of silently succeeding.
- **Sync preserves the earned SerpApi promotion.** `syncRegistryDefinitions`
  unconditionally overwrote `integration_state`, silently reverting the
  runtime promotion `recordSerpApiAccountStatus` earns for
  `cap.serpapi_ads_transparency` when the free account probe succeeds. Sync
  now preserves a stored `real` on that one key while its declared state is
  `pending`; a failed probe still demotes it through the same runtime path.
  Every other capability's state remains the registry's claim. No
  `docs/execution-handbook/` contract covers capability integration states, so
  the decision is recorded here and in the code comments.

## 0d. cap.umami promoted to real, 2026-08-28

The daily `umami-daily-observe` firing (pg_cron `aoos-umami-daily-observe`,
16:45 UTC) had failed on every run with "Capability "Umami (self-hosted
analytics)" is not authorised yet": the workflow runner admits only `real`
capabilities, and `cap.umami` was still declared `pending` even though its own
promotion condition ("pending until one authenticated read stores a snapshot")
was met on 2026-08-18. Re-verified against the production database on
2026-08-28: exactly four `umami_snapshots` rows for TruMove, all from one
succeeded `measurement_runs` row with `authenticationSucceeded: true` and HTTP
200, and three stored `workflow_runs` failures carrying the exact refusal
above.

Promoted in `src/registry/modules/self-hosted-analytics.ts` and, because
registry sync is operator triggered, also in migration
`20260828120000_promote_umami_capability_real.sql`, which flips the
`capabilities` row the runner actually reads.

**Waiting on a human:** the migration is a file until it is applied. After this
branch merges to `main`, apply it (Lovable prompt: "Apply pending Supabase
migrations") or run the registry sync from the admin surface. The 16:45 UTC run
keeps failing until one of those happens.

## 0e. Outcome verdicts feed the loop, 2026-08-28

Until this change, a computed outcome verdict, including `failure`, fed nothing
but a coloured label on Site health: nothing consumed `outcomeVerdict` outside
`site-health.ts`, an operator could mark verified a change the system graded a
failure, and a failed change never suggested its own rollback. Closed, minimally
and honestly:

- **Failure files to Inbox.** `src/lib/outcome-alerts.server.ts` runs at the end
  of each daily Search Console observation, right after the evidence windows are
  captured (the only moment a verdict can newly resolve). Each change whose
  graded reading is a failure gets one needs-attention item, once per change
  ever, carrying the verdict's own reason and window and linking to
  `/changes/$id` where the rollback control already lives. Verdicts come from
  `outcome-verdict.ts` as-is; the new module only selects.
- **Verifying is an informed act.** `fetchChangeRequest` now returns the
  change's graded readings (same assembly and grading as Site health, narrowed
  by a new `changeRequestId` parameter on `fetchStoredOutcomes`), rendered on
  the change page's Outcome card and inside the execution card beside Mark
  verified. The verify gate is deliberately unchanged (finalized post-change
  GSC rows); the verdict is displayed context, and
  `docs/execution-handbook/OUTCOME_MEASUREMENT.md` now records both the verdict
  layer and that non-gating decision.
- **Success reads as a completed journey.** On the Site health outcomes tab,
  decided verdicts sort above the still-waiting readings (worst news still
  first) and a success card states the journey is complete rather than sitting
  under "too early" cards.

`getMeasurementWatch` remains display-only, as designed.

## 0a. Current state, 2026-08-25

- **2026-08-28:** the nightly propose-from-evidence job can now succeed:
  migration `20260828090000` lets `create_title_h1_proposal` accept a null
  actor as the governed system path (drafts logged as a system actor, human
  approval unchanged, non-null actors keep every check), and
  `isTerminalConfigurationFailure` now pauses the job on the tenant-visibility,
  operator-authority, and no-renderer refusals instead of retrying every
  night. The migration still needs applying to the remote project; until then
  the job pauses itself on the first refusal.

Measured on this branch, not recalled: `npm run typecheck` clean, `npm test`
**1259 passing in 123 files**, `npx eslint .` **0 errors and the same 14
pre-existing react-refresh warnings**. Section 0's figures (1168 tests in 118
files, at `2a2e87f`) are superseded and left in place as a dated record.

**Connector ledger: 19 rows.** SearXNG was removed in #65 (catalogued, probed,
read by nothing, and not wanted), and OpenAI Ads conversions was added here --
it was the only outbound-write integration the ledger could not see. GA4 gained
a real probe in #65 using the JWT signing that already existed in
`measurement/ga4.server.ts`; four connectors remain in `noSafeProbe`
(`google_search_console`, `pagespeed_insights`, `perplexity`, `openai_ads`),
each because it has no free read-only endpoint, which is stated rather than
papered over with an invented probe.

**Correction, 2026-08-25:** an earlier version of this block claimed the
change-request lifecycle could not complete through the UI. **It was wrong.**
`transition_change_request` is a Postgres RPC granted to `authenticated`
(`supabase/migrations/20260811180753_*.sql`), so the state machine is enforced in
SQL and reachable without the TypeScript wrapper. The database has rows in
`applied` and `rolled_back`. See item 8 of
`docs/handoffs/2026-08-25-remediation-plan.md` for the retraction and the method
error behind it.

**Addendum, 2026-08-28: proposal drafting and publish proof render through
Crawl4AI first.** `createRenderedVerifier` in
`src/lib/execution/execute.server.ts` previously consulted only
`firecrawlEndpoint()`, so "Propose the fix" and "Check rendered page" failed or
spent credits whenever Firecrawl was down, while Crawl4AI sat healthy and
preferred everywhere else. The verifier now uses the same precedence as the
page audit: Crawl4AI first, Firecrawl only as fallback, with the fallback
provenance recorded in `renderedBy` the same way the audit records it. The
execution card names the renderer chain and prices the check honestly: no
charge on Crawl4AI, 1 credit only when the Firecrawl fallback answers. A stale
Crawl4AI render can only under-prove a forward change (the approved new wording
cannot exist in a cache older than the commit), so the proof's safety direction
is preserved.

**Addendum, 2026-08-28: measurement is no longer title/H1-only, and the
robots lane completes.** Two structural breaks closed:

- The measurement lifecycle triggers gated on `proposal_type = 'title_h1'`, so
  a meta-description change could be approved, committed, and proven live and
  then never receive a cycle, windows, or a verdict. Migration
  `20260828100000` extends both triggers to `page_metadata` — same observable
  (the page's own Search Console rows; Google places titles and descriptions
  in the same appearance-not-ranking category), so the grounded 14/28/56/90
  windows carry over with no new number invented — and backfills cycles and
  windows for any page_metadata change already approved or live.
  `site.crawl_directives` is deliberately not measured on these windows: its
  outcome is indexation, not click choice, and the migration says so.
- The crawl-directives lane could be committed but never proven applied,
  because the proof routine only accepted title/H1 and meta-description
  shapes. robots.txt is a static file, so its proof is not a render at all:
  the executor now fetches the deployed file, reads the committed file at the
  recorded commit through the GitHub executor, and compares whole files
  (`verifyPublishedRobots`, migration `20260828110000`). Whole-file
  comparison is deliberate — the site-wide unblock fix leaves a bare
  `Disallow:` line that literal containment cannot prove.

Still title/H1-only after this change, recorded so nobody thinks the job is
finished: the nightly autonomous proposal job files only title_h1 proposals,
and the "Write it again" verb exists only for title_h1 cards. Both are
proposal-generation gaps, not measurement gaps, and are tracked separately.

**How to read this file.** Section 0 is the current state and supersedes anything
below it that disagrees. The later sections are kept in the order they were
written, as a dated record of how the build got here. Where an older section
contradicts section 0, section 0 wins and the contradiction is named rather than
quietly edited away.

## 0f. Deletion pass and known orphan registry rows, 2026-08-28

Two deletions landed on this branch:

- `/today` (the old Action center, `src/routes/today.tsx`) is deleted along
  with its `NAV_EXEMPT` entry. It was a full duplicate approval queue on a
  different data path (`getInbox`/`getOverview`) that could silently disagree
  with the Command center at `/`. The server reads it used remain on disk:
  `getOverview` is still consumed by `/command-center`; `getInbox`,
  `resolveInboxItem` and `getMeasurementWatch` now have no route consumer and
  are candidates for a later pass.
- `src/lib/connectors/vps-runtime.server.ts` (a two-line re-export shim nothing
  imported) and its test are deleted. `n8n.server.ts` / `triggerN8nWorkflow`
  and its tests stay: whether n8n gets wired or removed is a pending operator
  decision.

**Known orphan registry rows, documented for a later decision — do not delete
the data.** These database rows exist only because the 2026-08-04 seed
migration (`20260804091534_*.sql`) inserted them; they are not declared in
`src/registry/modules/*.ts`, and `src/registry/sync.server.ts` only upserts —
it never prunes — so a registry sync can neither refresh nor remove them:

- `agent.research` — seed-only, but **still read at runtime** by
  `src/lib/web-research.server.ts`, so pruning it would break web research.
- `wf.research_refresh`, `wf.content_generation`, `wf.publish` — seed-only
  workflows.
- `growth.weekly_scan`, `content.brief_pipeline` — declared until 2026-09-02
  (CODE-14); each carries two recorded runs, so the rows stay until a
  decision on the history they hold. (`wf.seo_validation` is seeded _and_ declared in code, so it is
  not an orphan.)
- `sch.research_refresh`, `sch.seo_validation`, `sch.content_generation`,
  `sch.publish` — seed-only schedules, all disabled since
  `20260814070000_signal_integrity_recovery.sql` set every schedule except
  `gsc-daily-observe` to disabled.

Whether these rows should be pruned, or re-declared in the code registry, is a
human decision that has not been made.

## 0. State of the build, 2026-08-21

Verified in this worktree at `2a2e87f`: `npm run typecheck` clean, `npm test`
1168 passing in 118 files, `npm run lint` 0 errors and 14 pre-existing
react-refresh warnings. What follows is read from code and applied migrations;
anything about a live provider or the production database is marked as such and
was not re-verified here.

### The product surface

The eight numbered workspaces of the original brief were replaced by a
seven-slot category navigation, defined once in `src/lib/categories.ts` and
capped permanently. The Command center and four of the six category pages are
built:

| Category                | Page                      | Route it renders at       | Reserved slug              |
| ----------------------- | ------------------------- | ------------------------- | -------------------------- |
| Command center          | `command-center-page.tsx` | `/`                       | —                          |
| Getting found on Google | `getting-found-page.tsx`  | `/search`                 | `/getting-found-on-google` |
| Your pages              | `your-pages-page.tsx`     | `/pages`                  | `/your-pages`              |
| Site health             | `site-health-page.tsx`    | `/measurement`            | `/site-health`             |
| Connections             | `connections-page.tsx`    | `/capabilities`           | `/connections`             |
| Who visits your site    | not built                 | `/ga4` (absorbed)         | `/who-visits-your-site`    |
| Your competition        | not built                 | `/competitors` (absorbed) | `/your-competition`        |

**Deviation from the redesign plan, recorded deliberately.** The plan said each
category's `to` would move to `/${slug}` when its page landed. It has not: the
new pages render at the legacy routes instead. `categoryForPath` matches both,
so the navigation and breadcrumbs are correct either way, but the reserved slugs
are still unused. Moving them is a one-line change per category plus redirects,
and nobody has decided when.

The roughly thirty legacy routes are still on disk and still reachable by URL,
outside the new navigation by design. The old sidebar
(`src/components/os/shell.tsx`) is unused and retained.

### Connections: the four stages

`src/lib/connections.ts` grades every account on how far its evidence actually
travels: not configured, configured, collecting-and-reaching-nobody, reaching
you. Stage three is where most of this estate sat, and the page exists to say so
per connection with the row counts behind it. Only four modules in the codebase
write a recommendation, so any connector outside their reach stops at stage
three however well wired it is. `connections.registry.test.ts` asserts the
registry against the rest of the codebase, so a stage claim cannot drift from
what the code does.

### The rule-threshold audit is closed

`docs/handoffs/2026-08-20-rule-thresholds-audit.md` is done. Its finding was that
every threshold had been written for a site with roughly a hundred times this
property's traffic, so almost no rule could fire, and that lowering them until
they fired would have been worse than silence.

What shipped instead, in `src/lib/rule-buckets.ts`: all 24 finding rules across
the Search Console, SEO-validation and GA4 families are assigned a bucket —
**5 `fact`** (answerable at any volume: indexation, robots and sitemap states),
**13 `pooled`** (click-shaped questions answered across the property rather than
per page), **6 `beyond_current_volume`** (the page states the volume that would
make it answerable and ships no threshold). No threshold value is written out by
hand; every number is read from the threshold objects.

The same registry carries `alsoNeeds`, the non-volume prerequisites — a second
collection window, the page audit having run, analytics connected, a stored URL
inspection, approved keywords, two backlink readings. Every empty list on the
category pages now names the prerequisite it is waiting on, and distinguishes
"never run" from "not yet". Migration `20260820200000_grounded_measurement_windows`
carries the grounded windows.

### The suggestion queue can be acted on

`src/lib/suggestion-queue.ts` is the state machine: open / ignored / done, dedup
by `issue_fingerprint`, urgency ranking, seven visible per week. Every card now
renders the verbs the queue says are legal (`suggestion-verbs.ts`,
`suggestion-card.tsx`) or an on-screen sentence saying why a verb is absent —
never a disabled control. Legality that was previously a lie was corrected at
the source: observation-only rows lost `canIgnore`, audit findings gained it
once suppression storage existed (`20260821090000_suggestion_suppressions`,
including the `UPDATE` grant the upsert needs), and the ignore verb on a
change-kind card reads Reject, because `rejectChangeRequest` is terminal.
Approve still routes only through `/changes/$id`.

### The page audit

`src/lib/page-checks.ts` runs 30 checks over the HTML a single render already
returned, up to 100 pages per run. Crawl4AI at `crawl.marky.systems` is the
primary renderer; self-hosted Firecrawl at `fire.marky.systems` is its fallback
and is only called if Crawl4AI throws. A live audit on 2026-08-24 read 30/30
pages entirely through Crawl4AI with zero Firecrawl calls. The structure-enforcement lane added
URL conventions (underscores, parameters), missing image width/height, orphan
pages no internal link path reaches, expected schema type per page kind, and
redirect / canonical-chain / meta-refresh checks. `PAGE_CHECK_FIX` in
`audit-fixes.ts` is exhaustive over `CheckId`, so `tsc` refuses a new check
without its fix target.

Deliberately not built, with the reason recorded in the module header: image
file weight (the render returns no byte sizes), click depth (no Google document
sets a maximum, so any limit would be invented), and per-page speed, which is
the stored PageSpeed reading on Site health.

### The targeting layer

`targeting-rules.ts` plus `dataforseo/targeting-rules.server.ts` is the fourth —
and newest — module that writes a recommendation, which is what moved DataForSEO
from stage three to stage four. Approved keywords that nothing has observed, and
keywords with no page to rank, are now findings. The competitor keyword gap files
as `keyword_candidates` in `pending`, entering the approval flow
`decideKeywordCandidates` already governs; nothing is auto-tracked. Difficulty
and intent scoring runs on an operator click, batched at 1000 keywords with
"scored N of M pending" reported when the queue is longer. Referring-domain
movement is reported from backlink snapshots already stored.

**Verified dead end, so nobody re-derives it:** question mining from stored SERP
payloads does not work. A read-only query against the real stored rows returned
40 `serp_organic` snapshots with an item-type histogram of `{organic: 741}` and
no `people_also_ask` at all, because `payload->'rows'` is a projection filtered
at ingest (`serp.server.ts`). The absence reflects what AOOS chose to keep, not
what Google returned. Recovering it needs a different provider call.

### Model routing

Every model call routes through a self-hosted LiteLLM proxy when
`LITELLM_BASE_URL` and `LITELLM_API_KEY` are set, with OpenRouter behind it, and
falls back to the previous paths when they are not. The server side is deployed
and documented in `docs/litellm-routing.md`, including the stated simplification
that there is no database behind the proxy, so the app authenticates with the
master key rather than a virtual key. `LOVABLE_API_KEY` is still required for
Search Console, which is a data gateway and unaffected by any of this.

### CI is a real gate

`.github/workflows/ci.yml` runs lint, typecheck, test and build on every pull
request. Before that, `vite build` was the only check and type errors could
reach `main` freely despite a strict `tsconfig`. Earlier records in this file and
in the lane plans describe repo-wide lint as "pre-broken with thousands of
prettier errors" — that is no longer true and those notes are stale.

### Still blocked, still waiting on a human

Unchanged from the sections below, restated because they are the things most
likely to waste someone's afternoon:

- `GITHUB_EXECUTOR_TOKEN` **is configured and has been since 2026-08-11**: seven
  executions with a recorded commit and six change requests with a source
  commit, the first on 2026-08-11 (live `change_request_executions`,
  2026-09-02). An earlier version of this bullet said the opposite; the UI
  names the absence exactly and refuses without writing whenever a host lacks
  the token, which is how the Vercel shadow behaves. **Where this secret
  lives, recorded 2026-08-28 so nobody hunts for it again:** it is a fine-grained GitHub personal access token
  created on the `maxwest525` GitHub account, scoped to the single repository
  `maxwest525/brittmove-829a7519` with Contents read/write only (the executor
  is hard-allowlisted to that repo and branch in
  `src/lib/execution/allowlist.ts`, so a wider token buys nothing). It is
  placed in the AOOS Lovable project's secret store (Project Settings, then
  Secrets, in the Lovable editor for the project deployed at
  `trumove-resource-center.lovable.app`). It is never written into `.env`,
  never a `VITE_` variable, and does not belong to the customer site's
  project. A newly placed value is not live until the next Lovable publish,
  and a deleted one survives until the next publish; see AGENTS.md, "The
  layer that keeps costing hours". Proof of placement is the
  `github_executor` probe on `/capabilities/systems` turning healthy, or the
  execution card on `/changes/$id` reporting the executor connected; the
  settings screen alone proves nothing. If the deployment ever moves off
  Lovable, this secret moves to the new platform's secret store with it; the
  token authenticates to GitHub and is platform-independent.
- `cap.github` is not connected, which blocks `wf.publish`.
- The six-domain competitor shortlist is still `pending` in `/competitors`. An
  agent must not approve or reject it.
- The free SerpAPI account gate for `cap.serpapi_ads_transparency` still needs
  revalidating. All ads schedules remain disabled.
- Two categories have no page yet: Who visits your site, and Your competition.

## 1. What AOOS is

An internal marketing operating system for the company. It is **not** the public
TruMove website and not a CRM. It manages marketing assets, AI agents, workflows,
MCP tools, connectors, schedulers, recommendations, evidence, and approvals.

Workspaces: Inbox (root route, operational center), Command Center, Assets,
Capabilities, Agents, Workflows, Knowledge, Recommendations, Scheduler, plus
operator surfaces for Keywords and Competitors.

## 2. Permanent rules

1. **Documentation-first integrations.** Authoritative provider docs are read and
   digested before any integration code is written. Required artifacts: persistent
   digest, selective technical cache, capability map, blueprint, risk register,
   operator approval. No secrets are ever written into knowledge or digests.
2. Capabilities, agents, and workflows are declared in `src/registry/modules/*.ts`
   and synced to the database. No hardcoded per-integration UI.
3. Every integration carries a real / simulated / pending / mock state. A mock is
   never presented as connected.
4. Mutating agent or workflow steps require explicit human approval, filed to Inbox.
5. Multi-tenant: `tenants` + `tenant_members`, tenant-scoped RLS on registry tables.
6. UI: dark cyber-luxury theme, semantic tokens only, outlined buttons only, no
   em dashes in copy.

## 3. Live integrations (real, not simulated)

| Capability                                          | State                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PageSpeed Insights (Measurement workspace)          | implemented, provider-blocked, manual only | `/measurement/tools`. One click, one v5 request. No schedule. Runs and immutable snapshots are stored in `measurement_runs` / `pagespeed_snapshots`. The configured provider project is returning HTTP 429 daily-quota failures: 5 stored attempts, 0 stored measurements. Missing data is not reported as zero.                                                                                                                                                                                                                               |
| GA4 Data API                                        | real                                       | Property `properties/536830122`. First successful immutable snapshot stored 2026-08-18: 124 returned rows, 48 pages, 135 sessions, and 748 events for the 28-day window. Daily read-only schedule is enabled.                                                                                                                                                                                                                                                                                                                                  |
| Umami (self-hosted)                                 | real                                       | Credentials, property listing, and the first authenticated 28-day read are proven. Four immutable rows were stored on 2026-08-18 for TruMove. The provider returned zero pageviews, visitors, visits, and bounces for that window; this is a real provider result, not substituted missing data. The deployed instance accepts `metrics type=path`, not `type=url`.                                                                                                                                                                            |
| Google Search Console                               | real                                       | Idempotent daily site / page / query snapshots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| DataForSEO Labs                                     | real                                       | Keyword ideas, competitor derivation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| DataForSEO SERP (Standard queue)                    | real                                       | Postback hook at `/api/public/hooks/dataforseo-postback`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DataForSEO Backlinks                                | real                                       | Pay-as-you-go pricing as of 2026-07-01.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Firecrawl (self-hosted) / Web Research (Perplexity) | real                                       | Page inspection and cited research. Rendering resolves through `firecrawlEndpoint()`, which prefers the self-hosted deployment; the metered cloud is a fallback only. Rendered-page verification in `execution.functions.ts` now reads that same chooser rather than `FIRECRAWL_API_KEY`, so it no longer reports itself unconnected when only the self-hosted deployment is configured. `FIRECRAWL_API_KEY` is not a project secret and could not be deleted from the project layer; if it is still injected it sits in workspace Connectors. |
| Competitor intelligence                             | real                                       | Built on 39 completed SERP snapshots, 71 observed domains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| MCP read tools                                      | real                                       | Guarded by `src/lib/mcp/guard.ts` (auth + audit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SerpAPI Ads Transparency                            | pending gate, proven canary history        | Direct account/canary code exists and 11 successful canary ledger rows are stored. The free provider gate must be revalidated; creative and live paid-SERP stages remain pending.                                                                                                                                                                                                                                                                                                                                                              |
| GitHub (`cap.github`)                               | not connected                              | Blocks `wf.publish`. Do not connect without approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Spend controls: DataForSEO ceiling **$300/month**, ledgered per request, alerts at
50/75/90/100%. Spend to date is far below ceiling (cents, not dollars).

## 4. Evidence and classification rules

- SERP `competitor` vs `surface` classification is preserved. A domain that ranks
  is not automatically a direct business competitor.
- Competitor confidence and classification uncertainty are always retained.
- Observations are stored separately from recommendations.
- Transparency-style ad evidence never implies spend, impressions, or performance.

## 5. Pending operator approvals

1. **Competitor shortlist** (6 domains: United Van Lines, Allied and others) awaits
   human review in `/competitors`. All six are in `pending`; none are approved,
   rejected, or tracked. The agent must not approve or reject these.
2. GitHub credential / `cap.github` authorization for `wf.publish`.
3. Revalidate the free SerpAPI account gate for `cap.serpapi_ads_transparency`. Direct canary code and prior advertiser evidence exist; downstream creative and live paid-SERP capabilities remain separately pending.

Legacy agent and workflow approval notices were moved to Needs attention because
approval continuation is not wired. New notices use the same honest Open-only
contract until a real continuation handler exists.

## 6. Active workflows

- `gsc-daily-observe` (real)
- `dfs-serp-observe` (real, 40 approved keywords)
- `wf.research_refresh` (real)
- `wf.seo_validation` (real rule engine, 10 rules incl. competitor rules)
- `wf.content_generation` (parked at review)
- `wf.publish` (blocked on `cap.github`)

## 7. Performance baseline (post-optimization)

Measured in-browser client navigation between workspaces: **100-185 ms**, warm
second visits served from the query cache. Applied fixes:

- `defaultPreload: "intent"`, `defaultPreloadDelay: 50`, shared pending component.
- Query defaults `staleTime: 30s`, `gcTime: 5m`, no refetch on window focus.
- `ssr: false` on operator-only workspace routes (removes hydration mismatch).
- Non-blocking loaders: `ensureQueryData(...).catch(() => undefined)`.
- Request-scoped Supabase client cache keyed by bearer token, 60s TTL
  (`src/lib/tenant.server.ts`), removing repeated auth/tenant round trips.
- Command Center metric fan-out collapsed into one `Promise.all` batch.
- The generated route tree is treated as immutable; the former runtime
  parent-link mutation was removed. Development-only route-split HMR wrappers
  are disabled because they could evaluate a child against a stale parent and
  collapse multiple route IDs to `/`; normal Vite updates remain enabled.
- The operator session hook releases its visual gate from persisted identity
  metadata and subscribes to future auth changes. It must not call
  `auth.getSession()`: that competes for the auth client's session lock with the
  server-function middleware and previously left every workspace suspended on
  skeletons for several seconds. Server-function middleware also attaches the
  already-persisted access token directly instead of acquiring that lock.
  Authorization and token validation remain server-side.
- Active tenant resolution now reads its RLS-scoped profile, membership, and
  single-tenant fallbacks concurrently. The tenant switcher also loads the
  visible tenant list and active selection concurrently, removing avoidable
  serial backend round trips from every cold workspace load.
- Node's exact `abortIncoming` / `socketOnClose` error is classified as a browser
  request cancellation at both server boundaries and returns 499 without fatal
  logging, including when the framework logs before wrapping the response.
  Generic application errors named `aborted` remain visible.

## 8. Next build priorities

1. **Google Ads Transparency / paid competitor intelligence** via SerpAPI, applying
   the documentation-first rule. Capability `cap.serpapi_ads_transparency`, modules
   `ads.advertiser_resolution`, `ads.creative_intelligence`,
   `ads.landing_page_intelligence`, `ads.live_serp_observation`,
   `ads.vendor_network_analysis`. Phase 1 is read-only and evidence-first.
2. Vendor watchlist for discovery: equatemedia.com, billy.com, moveadvisor.com,
   mymovingreviews.com, resultcalls.com, doppcall.com, 99calls.com,
   quoterunner.com, movematcher.com, budgetvanlines.com, 2movers.com.
3. After evidence quality is proven: paid-media recommendations, then publish path.

## 9. Operator truth pass (Inbox clarity, observations, Command Center)

- **Clear is reversible.** `inbox_items.cleared_from_lane` + `cleared_by` record
  provenance. `clear_inbox_item` / `reopen_inbox_item` are SECURITY INVOKER RPCs
  (authenticated execute only) and are the only write path. Pending approval can
  never be cleared; Completed shows "Unclear" only for manually cleared rows.
- **Facts are not approvals.** Rows with `metadata.observationOnly = true` now
  carry `state = 'observed'`, `requires_approval = false`, and live in the FYI
  lane. Their detail page states what the evidence is, what it does not mean, and
  the next real decision. Approve/Reject is hidden and rejected server-side.
- **No fake approvals.** `src/lib/recommendation-action.ts` is the single source
  of truth for whether a suggested action has an executable handler. No kind is
  wired to one yet, so every detail page says so plainly instead of offering a
  button that changes a column and nothing else.
- **Command Center leads to work.** Quick actions (safe navigation only), count
  tiles link to their workspace, capability rows link to capability detail, run
  rows link to workflow detail and show the stored error on failure. All of it
  still comes from the one `command_center_overview` RPC.
- **Google Ads Transparency is the product name.** SerpApi appears only in
  connection/account/ledger detail. `/ads/advertisers` is a deep review surface
  reached from Inbox and Command Center, not a sidebar workspace. The one-credit
  canary is behind an explicit spend confirmation dialog.
- **Search Console panel reads as the operator.** `getSearchConsoleState` used an
  anon publishable client, so tenant-scoped RLS correctly returned nothing and the
  panel looked empty even with rows stored. It is now behind `requireSupabaseAuth`
  and reads through `context.supabase`. The panel invokes that protected read via
  `useServerFn`, ensuring the global bearer-token middleware runs before each
  query. `syncProperties` upserts on
  `(tenant_id, site_url)`, matching the real unique index.
- **Vendor advertiser sweep.** `src/lib/serpapi/sweep.server.ts` walks unresolved
  watchlist domains one at a time through the single-credit canary path, so each
  request keeps its own ledger reservation, account floor check, and idempotency
  key. It stops at the first account or credential refusal. A provider "no
  results" reply is a successful empty observation, not a transport failure, and a
  previously failed reservation is retried under a distinct run key.
- **Ads schedules are registry declarations only.** The runtime allowlist and production rows keep every ads cadence disabled. Creative or live paid-SERP work remains manual and capability-gated.
- **Digest is in Knowledge.** The Google Ads Transparency digest v1.0.0 is filed in
  kb.documents, tagged `cap.serpapi_ads_transparency`, pointing at
  `docs/integrations/serpapi/DIGEST.md`.

## 10. Phase 2 visibility slice one: Search workspace

First Phase 2 real-data surface. `/search` renders only what Google Search Console
actually observed for `sc-domain:trumoveinc.com`, read tenant-scoped and
authenticated through `getSearchWorkspace` in `src/lib/search.functions.ts`.

Sections: Overview (property totals per finalized Pacific date), Pages, Queries,
Page + query, Devices and countries, Indexing & sitemaps. No raw JSON, no snapshot
IDs, no ledger rows, no derived score or trend. The evidence-limits notice states
plainly that only three finalized dates exist and volume is sparse.

Proven live values: latest finalized date 2026-08-08 with 1 click, 18 impressions,
5.6% CTR, average position 14.9; 2026-08-06 and 2026-08-03 also stored; nine pages
and eight disclosed queries; two sitemaps (29 and 10 submitted URLs, 0 indexed, 0
warnings, 0 errors).

Placeholder correction applied by migration: the primary marketing site asset now
carries `https://trumoveinc.com` and the domain asset is named `trumoveinc.com`.
The selected Search Console property was not changed.

The Search Console connection controls stay on the asset detail page, which now
links to the Search workspace for the actual metrics.

## Tool estate inventory (2026-08-11)

Tables: `tool_systems`, `tool_operations`, `tool_aliases` (tenant scoped, member read, operator/admin write).
Surface: `/capabilities/systems` and `/capabilities/systems/$key`, linked from the Capability Registry header.
Snapshot: 46 canonical systems, 152 operations, 20 alias registrations, frozen discovery date 2026-08-11.
Truth rule: installed, credentialed, live proven, and callable from AOOS are independent facts. Nothing local is
marked callable; AdLoop and OpenSEO read "Installed locally, not connected to AOOS". Provider APIs are recorded as
"surface counted, full normalized import queued" with no invented operation rows. No credential values, tokens, or
secret paths are stored.

## Tool estate correction (2026-08-11)

- SearchAtlas excluded by operator policy: systems, operations, aliases, and all UI results removed. Search returns zero.
- Vault represented as remote, metadata-only, not AOOS-callable: "25 metadata records checked, 20 active records mapped to 16 providers, secret values never copied." No credential names, labels, IDs, hosts, paths, or values are stored or shown.
- Readiness is six independent facts: available to enable, enabled, credentialed, implemented in AOOS, callable from AOOS, visible. Credential metadata never promotes enabled or callable.
- /capabilities/systems now has Essentials (default, 11 foundational systems) and All systems (58). Keyword Planner is an alias of Google Ads API.
- Counts recalculated from database truth: 58 canonical systems, 139 operations, 21 aliases. Essentials view: 11 systems, 91 operations, 4 aliases.

## Change-request execution adapter (source commit + published proof)

- `src/lib/execution/source-change.ts` — pure guards: exact before/after replacement (refuses on any count other than one), commit marker, published-page title/H1 proof.
- `src/lib/execution/execute.ts` — dependency-injected execute and publish-check loops. Operator-only, id-only input, replay-safe.
- `src/lib/execution/execute.server.ts` — GitHub contents API bridge (`GITHUB_EXECUTOR_TOKEN`), execution store, public page fetch.
- `src/lib/execution/execution.functions.ts` — `getExecutionState`, `executeChangeRequest`, `checkChangeRequestPublished`.
- `src/components/os/execution-card.tsx` — six-stage plain-language status, execute + check published, attempt log, "Provider API charge: $0" with the AI build usage caveat.
- Migration: `change_requests.source_repo/source_branch/source_commit_*/published_proof_*` and `public.change_request_executions` (tenant read, server write).
- Applied now means proven live on the public URL; the manual "Mark applied" button is gone. Verification still requires finalized post-change Search Console rows.
- Corrected 2026-09-02: `GITHUB_EXECUTOR_TOKEN` is configured; real commits have been made since 2026-08-11 (see §0 above). The UI names the absence and refuses without writing only on a host that lacks the token.

## Direct measurement truth (2026-08-14)

- **GA4 Data API is implemented as an operator-triggered read.** It uses
  `properties/536830122`, a 28-complete-day window, and the official
  `runReport` endpoint. The stored inventory is keyed by hostname, exact page
  path plus query string, and event name. Every attempt opens and closes a
  `measurement_runs` row; only successful provider responses create immutable
  `ga4_snapshots`.
- **Credential presence is not connection proof.** AOOS accepts either
  `GA4_SERVICE_ACCOUNT_JSON` or the complete OAuth refresh-token trio. The UI
  says Configured until a successful snapshot exists, then Connected. A browser
  measurement ID can emit events but cannot authorize reporting reads.
- **No background analytics loop exists.** Refresh is an operator action. GA4 is
  measurement-only and never blocks proposal generation.
- **SerpAPI stays separate from DataForSEO.** Only the free
  `cap.serpapi_ads_transparency` account check may run while pending. Advertiser
  resolution, creative intelligence, and live paid-SERP observation remain
  blocked until their own registry states become real. All ads schedules remain
  disabled.

## Discovery only, no implementation: two further Google APIs

Operator disclosed on 2026-08-19 that the GA4 Measurement Protocol and the GA4
Admin API are available, plus a third "Hub API" that is still unnamed. Per the
documentation-first rule, authoritative digests were filed before any code:

- `docs/integrations/ga4-admin-api/DIGEST.md` — read-only configuration
  discovery. `accountSummaries.list` would make GA4 property binding
  evidence-driven instead of the hardcoded `properties/536830122` reference.
  REST over fetch, not the gRPC GAPIC client, because of the Worker runtime.
- `docs/integrations/ga4-measurement-protocol/DIGEST.md` — a write-only path
  into a live GA4 property. Its live endpoint returns no error codes, so a
  successful POST is not evidence of anything; proof requires a debug-endpoint
  validation pass plus a subsequent Data API read observing the event. Mutating,
  therefore approval-gated and never on a cadence.

No capability, schema, secret, or route exists for either. Both remain
unapproved. The Hub API has no digest because the vendor is unidentified.

## Google Search Essentials skim, 2026-08-19

Operator supplied the Search Essentials, Search Console tooling, starter guide,
Rich Results Test, and Schema.org links. Filed
`docs/integrations/google-search-essentials/DIGEST.md`.

Findings that change how AOOS should treat Search Console:

- Google's material is three layers: Essentials (pass/fail eligibility),
  Strategy (the starter guide's page-level work), and Enhancements (structured
  data). AOOS only touches performance rows, which sit under none of them.
- Page Indexing, Rich result status, Core Web Vitals, Removals, Manual actions,
  and Security have no API. They must be reconstructed URL by URL through URL
  Inspection against a prioritized page list.
- URL Inspection already stores coverage state, canonical mismatch, mobile
  usability, and rich results verdict. Nothing consumes those fields.
- `site.structured_data` is already an allowed change kind, but no code ever
  reads a page's JSON-LD or proposes markup.

Sequencing recommended, none of it implemented: consume the stored inspection
fields, ingest layers 1 and 2 as citable knowledge, add a JSON-LD reader and
diff, then widen page proposals beyond title and H1.
