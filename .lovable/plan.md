# Workflow engine: what the missing features actually need

Three things on the workflow page cannot be built as UI alone. Each needs a real change to how a run is stored and driven. Below is what each one requires, in the order that makes them possible, and what it buys you.

## Where the engine is today

A run is one uninterruptible server call. It starts, walks the steps in order, and returns when it is done. Nothing outside that call can see it mid-flight or reach into it. Two consequences:

- There is no way to pause or cancel a run, because nobody is listening while it executes.
- A run that hits an approval step stops for good. The workflow refuses to start at all when the graph contains an approval or agent step, so approvals never park and resume, they just block.

The database already knows about `queued`, `running`, `awaiting_approval`, `succeeded`, `failed`, and `cancelled` states, so the vocabulary exists. The runner never uses most of it.

## Slice A: checkpointed runs (the foundation)

Turn a run from "one long call" into "a sequence of resumable ticks."

- The run records where it is: which step is next, and the outputs collected so far.
- A worker advances the run one step per tick instead of running the whole graph in one breath.
- Between ticks the run checks a control flag, so an outside request can stop it.
- Every tick writes its result before the next begins, so a crash or restart resumes instead of replaying.

Without this, B and C are cosmetic. With it, both become straightforward.

**Done when:** a multi-step workflow can be started, stopped halfway, and picked back up from the step it stopped on, with no step executing twice.

## Slice B: run controls (start, pause, resume, cancel)

Built on A.

- Pause sets the control flag; the run finishes the step in flight and parks. It does not kill work mid-call.
- Resume clears the flag and re-queues the run.
- Cancel parks it permanently in `cancelled` and records who cancelled it and when.
- The workflow page shows live status and step progress, with buttons that reflect what is actually possible for that run right now.

Honest limit: pause takes effect at the next step boundary, not instantly. A step that is already calling an external provider will finish that call.

**Done when:** the page shows a run advancing step by step, and each control changes the run's real state and is visible in the audit trail.

## Slice C: approval continuation

Built on A. This is the one that unblocks real work.

- An approval step parks the run at `awaiting_approval` and files the decision to the Inbox with the exact payload awaiting approval.
- Approving resumes the same run from the approved point, carrying the earlier steps' outputs. No manual restart, no re-running finished steps.
- Rejecting closes the run with the decision recorded.
- The runner stops refusing graphs that contain approval steps.
- Fail closed: if identity, payload, or resume position cannot be proven, the run stays parked and says why.

**Done when:** a workflow with an approval gate runs, parks, is approved from the Inbox, and finishes on its own with a complete receipt.

## Not in scope here

Drag-and-drop step editing. That is a separate problem: workflow graphs are declared in the registry files and synced to the database, so an in-page editor needs a decision about which side wins when they disagree. Worth doing, but after the engine is resumable, and it needs its own plan.

## Suggested order

A, then C, then B. C is the one with operational value; B is polish on top of the same foundation. If you would rather see something visible sooner, A then B then C also works.

## Technical notes

- Run position and accumulated step outputs get persisted on `workflow_runs`; a control column carries the pause/cancel request.
- `runWorkflow` in `src/lib/workflow-runner.server.ts` splits into `startRun` and `advanceRun`, with the existing per-node execution logic reused unchanged.
- Ticks are driven by the existing scheduler hook, so no new infrastructure.
- State changes go through a guarded database function, same pattern as `transition_change_request`, so transitions stay atomic and audited.
- `assertRunnableGraph` loses its approval refusal in Slice C; the agent refusal stays.
