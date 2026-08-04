# AOOS — Marketing Operating System (Phase 1 Foundation)

Build the OS shell and its registries. No marketing integrations, no fake analytics.

## Information architecture

Eight workspaces, one persistent left rail, one top command bar (global search, environment badge, operator identity).

```text
/                     Command Center
/assets               Assets            -> /assets/$assetId
/tools                Tool Registry     -> /tools/$toolId
/agents               Agent Registry    -> /agents/$agentId
/workflows            Workflow Registry -> /workflows/$workflowId
/recommendations      Recommendation Queue -> /recommendations/$recId
/scheduler            Scheduler         -> /scheduler/$jobId
/activity             Activity timeline
```

Every detail route uses the same shell: header (name, status, health, owner), tab strip (Overview / Configuration / Connections / Activity), right-hand context panel for linked entities.

## Navigation

Left rail groups:
- Operate: Command Center, Recommendations, Activity
- Manage: Assets, Workflows, Scheduler
- Registries: Tools, Agents

Collapsible to an icon rail. Active route highlighted. Mobile: rail becomes a sheet, tables collapse into stacked cards.

## Database design (Lovable Cloud)

Core entities, all with `id`, `created_at`, `updated_at`, `status`, `health`, `metadata jsonb`.

- `assets` — kind, name, owner_id, external_ref, config
- `tools` — key (unique), name, description, category, auth_kind, capabilities jsonb, config jsonb, last_run_at, health
- `tool_dependencies` — tool_id, depends_on_tool_id
- `agents` — key, name, purpose, description, memory_scope, permissions jsonb
- `agent_tools` — agent_id, tool_id, grant scope
- `workflows` — key, name, description, trigger_kind, graph jsonb (nodes/edges), version
- `workflow_runs` — workflow_id, started_at, finished_at, state, error, log jsonb
- `workflow_steps` — run_id, node_key, agent_id, tool_id, state, input/output jsonb
- `recommendations` — title, description, business_impact, confidence, reasoning, suggested_action jsonb, requires_approval, state
- `recommendation_targets` — recommendation_id, asset_id
- `recommendation_dependencies` — recommendation_id, depends_on_id
- `schedules` — name, cron, target_kind (workflow|tool|agent), target_id, enabled, last_run_at, next_run_at, last_duration_ms, failure_count
- `activity_events` — actor_kind (operator|agent|system), actor_id, verb, subject_kind, subject_id, summary, payload jsonb, occurred_at
- `user_roles` + `app_role` enum + `has_role()` security-definer fn

Every table: GRANTs, RLS enabled, policies in the same migration. Registry tables readable by authenticated users; writes gated on admin/operator role.

## Registry architecture

Registries are data-first, not code-first. Adding a capability = inserting a row plus dropping a self-describing module file; never editing core screens.

```text
src/registry/
  types.ts            ToolDefinition | AgentDefinition | WorkflowDefinition
  register.ts         define*() helpers + in-memory catalog
  sync.functions.ts   reconcile code definitions into DB rows on boot
  index.ts            import.meta.glob of the three module folders
src/modules/tools/*.tool.ts
src/modules/agents/*.agent.ts
src/modules/workflows/*.workflow.ts
```

`import.meta.glob` auto-discovers modules; `sync` upserts by `key` and marks missing rows `archived`. UI reads exclusively from the DB, so unknown future capabilities render with no code change.

## Workflow model

A workflow is a declarative DAG: `nodes[] { key, kind: agent|tool|approval|condition, ref, inputs }` and `edges[] { from, to, when }`. Execution is a server-side runner that walks the DAG, writes one `workflow_steps` row per node, and emits activity events. Approval nodes park the run in `awaiting_approval` until a recommendation is approved. Phase 1 ships the runner plus a read-only visual graph view; agent implementations stay outside the workflow record.

## Agent model

An agent declares purpose, permitted tools, permission scopes, memory scope (`none|task|asset|global`), and the workflows it may join. Runtime uses the AI SDK with the Lovable AI Gateway: server-side `streamText`, tools defined with narrow Zod schemas resolved from the agent's granted tool list, `stopWhen: stepCountIs(50)`, and `needsApproval` on any mutating tool so it routes into the recommendation queue. Phase 1 ships one reference agent to prove the contract end to end.

## Recommendation lifecycle

```text
draft -> proposed -> under_review -> approved -> scheduled -> applied -> verified
                            \-> rejected      \-> failed -> rolled_back
```

Nothing auto-deploys. Approval requires an operator with the approver role, is recorded with actor and timestamp, and emits an activity event. `applied` is only reachable through an explicit apply action.

## Scheduler model

Cron expressions stored per schedule. A single public cron endpoint at `src/routes/api/public/cron/tick.ts`, secret-verified, claims due schedules, enqueues runs, and records duration/failures. Manual run triggers the same path through an authenticated server function. Per-schedule log view reads `workflow_runs` and `activity_events`.

## Activity model

Append-only event log written by a single `logActivity()` server helper called from every mutation path. Filterable by actor, subject kind, verb, and time. Detail screens render a scoped slice of the same table.

## Folder structure

```text
src/routes/            one file per workspace + $id detail routes
src/components/os/     Shell, Rail, CommandBar, StatusDot, HealthBadge,
                       EntityHeader, DataTable, DetailPanel, EmptyState, Timeline
src/components/ui/     shadcn primitives
src/registry/          registry core (above)
src/modules/           self-registering tools / agents / workflows
src/lib/*.functions.ts server functions (registries, runs, approvals, activity)
src/lib/*.server.ts    runner, scheduler, activity logger, AI gateway wiring
```

## UI direction

Dark, calm, enterprise. Semantic tokens only, green primary accent, outlined buttons (no solid fills), hairline dividers, dense tables over cards, generous whitespace at the section level. Status conveyed by a small dot plus text, never colour alone. Empty states state the operational next action instead of showing placeholder charts.

## Phase 1 delivery order

1. Cloud enabled, full schema migration with GRANTs, RLS, roles, and seed rows for a handful of real assets/tools/agents/workflows.
2. App shell, navigation, shared OS components, design tokens.
3. Registry core plus module auto-discovery and sync.
4. Eight workspace screens with detail routes, wired to live data.
5. Workflow runner, scheduler tick endpoint, activity logger.
6. One reference agent through the AI Gateway proving the agent/tool/approval contract.

## Explicitly out of scope

No SEO/AEO/PPC/Meta/analytics/content integrations, no external API credentials, no autonomous deployment, no marketing dashboards.
