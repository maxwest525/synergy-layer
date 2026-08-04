# AOOS — Marketing Operating System (Phase 1 Foundation)

Build the OS shell and its registries. No marketing integrations, no fake analytics.

## Information architecture

Nine workspaces, one persistent left rail, one top command bar (global search, environment badge, operator identity).

```text
/                     Inbox (home)
/assets               Assets              -> /assets/$assetId
/knowledge            Knowledge           -> /knowledge/$entryId
/capabilities         Capability Registry -> /capabilities/$capabilityId
/agents               Agent Registry      -> /agents/$agentId
/workflows            Workflow Registry   -> /workflows/$workflowId
/recommendations      Recommendation Queue -> /recommendations/$recId
/scheduler            Scheduler           -> /scheduler/$jobId
/command-center       Command Center (platform health overview)
```

Every detail route uses the same shell: header (name, status, health, owner), tab strip (Overview / Configuration / Connections / Activity), right-hand context panel for linked entities.

## Navigation

Left rail groups:
- Operate: Inbox, Recommendations, Command Center
- Manage: Assets, Knowledge, Workflows, Scheduler
- Registries: Capabilities, Agents

Collapsible to an icon rail. Active route highlighted. Mobile: rail becomes a sheet, tables collapse into stacked cards.

## Inbox (replaces Activity as the home experience)

Every module submits work items into one unified Inbox. Grouped lanes:

```text
Needs Attention | Pending Approval | Scheduled | Completed | FYI
```

`inbox_items` carry source module, subject entity, priority, assignee, due/scheduled time, and an action set (approve, run, dismiss, open). The raw chronological `activity_events` log still exists underneath and is surfaced per entity and on the Command Center, but it is not the home screen.

## Assets

Assets represent anything the OS manages, typed by `asset_kind`: website, landing_page, research_dataset, blog, google_ads_account, google_business_profile, github_repository, supabase_project, domain, workflow, knowledge_collection, prompt, email_campaign, social_account, plus future kinds added as enum values without code changes to the screens.

Each asset shows status, health, owner, recent activity, connected workflows, connected agents, connected capabilities.

## Database design (Lovable Cloud)

Core entities, all with `id`, `created_at`, `updated_at`, `status`, `health`, `metadata jsonb`.

- `assets` — kind, name, owner_id, external_ref, config
- `capabilities` — key (unique), name, description, kind (mcp | api | connector | skill | repository | model | internal_module | service), category, auth_kind, capabilities jsonb, config jsonb, last_run_at, health
- `capability_dependencies` — capability_id, depends_on_capability_id
- `knowledge_collections` — kind (documents | repositories | skills | prompts | playbooks | research | design_systems | best_practices | agent_knowledge | memory | vector_collection), name, scope
- `knowledge_entries` — collection_id, title, body, source_ref, tags, embedding_ref
- `agents` — key, name, purpose, description, current_objective, current_task, last_result jsonb, memory_scope, permissions jsonb
- `agent_capabilities` — agent_id, capability_id, grant scope
- `agent_knowledge` — agent_id, collection_id, access (read | write)
- `workflows` — key, name, description, trigger_kind, graph jsonb (nodes/edges), version
- `workflow_runs` / `workflow_steps` — run state, timings, per-node input/output, errors
- `recommendations` — title, description, business_impact, revenue_impact, traffic_impact, time_saved_minutes, risk, confidence, reasoning, suggested_action jsonb, requires_approval, state
- `recommendation_targets` / `recommendation_dependencies`
- `schedules` — name, cron, target_kind, target_id, enabled, last_run_at, next_run_at, last_duration_ms, failure_count
- `schedule_dependencies` — schedule_id, depends_on_schedule_id, condition (on_success | on_complete)
- `inbox_items` — lane, source_module, subject_kind, subject_id, title, summary, priority, assignee_id, due_at, actions jsonb, resolved_at
- `activity_events` — actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload jsonb, occurred_at
- `user_roles` + `app_role` enum + `has_role()` security-definer fn

Every table: GRANTs, RLS enabled, policies in the same migration. Registry tables readable by authenticated users; writes gated on admin/operator role.

## Registry architecture

Registries are data-first, not code-first. Adding a capability = inserting a row plus dropping a self-describing module file; never editing core screens.

```text
src/registry/
  types.ts            CapabilityDefinition | AgentDefinition | WorkflowDefinition
  register.ts         define*() helpers + in-memory catalog
  sync.functions.ts   reconcile code definitions into DB rows on boot
  index.ts            import.meta.glob of the module folders
src/modules/capabilities/*.capability.ts
src/modules/agents/*.agent.ts
src/modules/workflows/*.workflow.ts
```

`import.meta.glob` auto-discovers modules; `sync` upserts by `key` and marks missing rows `archived`. UI reads exclusively from the DB, so unknown future capabilities render with no code change.

## Workflow model

A workflow is a declarative DAG stored as data: `nodes[] { key, kind: agent|capability|approval|condition, ref, inputs }` and `edges[] { from, to, when }`. Phase 1 prioritizes execution, observability, and maintainability: a server-side runner walks the DAG, writes one `workflow_steps` row per node, emits activity events, and files Inbox items. Approval nodes park the run in `awaiting_approval` until the linked recommendation is approved. Graph rendering in Phase 1 is a simple read-only step list plus a static graph summary; no visual node editor.

## Agent model

Each agent exposes: current objective, assigned workflow, current status, current task, last result, memory scope (`none|task|asset|global`), allowed capabilities, and the knowledge collections it may read. Agents retrieve context from Knowledge rather than embedding it in workflows.

Runtime uses the AI SDK with the Lovable AI Gateway: server-side `streamText`, tools defined with narrow Zod schemas resolved from the agent's granted capability list, `stopWhen: stepCountIs(50)`, and `needsApproval` on any mutating capability so it routes into the recommendation queue. Phase 1 ships one reference agent proving the contract end to end.

## Recommendation lifecycle

```text
draft -> proposed -> under_review -> approved -> scheduled -> applied -> verified
                            \-> rejected      \-> failed -> rolled_back
```

Every recommendation carries business impact, revenue impact, traffic impact, time saved, risk, confidence, dependencies, and suggested action. Nothing auto-deploys. Approval requires an approver role, records actor and timestamp, emits an activity event, and clears the Inbox item.

## Scheduler model

Cron per schedule, plus explicit dependency edges between schedules so chains run in order rather than as isolated jobs:

```text
Research Refresh -> SEO Validation -> Content Generation -> Approval -> Publish
```

A dependent schedule becomes eligible only when its upstream run satisfies the edge condition; a failed upstream blocks downstream and files a Needs Attention item. One secret-verified public cron endpoint at `src/routes/api/public/cron/tick.ts` claims due schedules, respects dependency state, enqueues runs, and records duration/failures. Manual run uses the same path via an authenticated server function.

## Activity model

Append-only event log written by a single `logActivity()` server helper called from every mutation path. Filterable by actor, subject kind, verb, and time. Surfaced on entity detail tabs and the Command Center; the Inbox consumes it to generate work items.

## Folder structure

```text
src/routes/            one file per workspace + $id detail routes
src/components/os/     Shell, Rail, CommandBar, StatusDot, HealthBadge,
                       EntityHeader, DataTable, DetailPanel, EmptyState,
                       Timeline, InboxLane
src/components/ui/     shadcn primitives
src/registry/          registry core (above)
src/modules/           self-registering capabilities / agents / workflows
src/lib/*.functions.ts server functions (registries, runs, approvals, inbox, activity)
src/lib/*.server.ts    runner, scheduler, activity logger, AI gateway wiring
```

## UI direction

Dark, calm, enterprise. Semantic tokens only, green primary accent, outlined buttons (no solid fills), hairline dividers, dense tables over cards, generous whitespace at the section level. Status conveyed by a small dot plus text, never colour alone. Empty states state the operational next action instead of showing placeholder charts.

## Phase 1 delivery order

1. Cloud enabled, full schema migration with GRANTs, RLS, roles, and seed rows for real assets, capabilities, agents, workflows, and knowledge collections.
2. App shell, navigation, shared OS components, design tokens.
3. Registry core plus module auto-discovery and sync.
4. Nine workspace screens with detail routes, wired to live data (Inbox first).
5. Workflow runner, dependency-aware scheduler tick, activity logger, Inbox item generation.
6. One reference agent through the AI Gateway proving the capability / knowledge / approval contract.

## Explicitly out of scope

No SEO/AEO/PPC/Meta/analytics/content integrations, no external API credentials, no autonomous deployment, no visual node editor, no marketing dashboards.
