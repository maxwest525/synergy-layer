# Workflow engine: manual-first stepping

Recommendation: manual for anything that changes the website, automatic for anything that only reads. Fully auto page edits are not worth it here. The evidence sources are still uneven (GA4 unproven, PageSpeed quota-blocked), and a wrong title or H1 pushed straight to the live site costs more to undo than a single click costs you. Reading is cheap and reversible, so let that run on its own.

You want each step run by you, with separated tools. That changes the engine from "one long automatic call" into "a run that sits still until you advance it." Everything below follows from that.


## Where the engine is today

A run is one uninterruptible server call. It starts, walks every step in order, and returns when finished. Nothing outside that call can see it mid-flight. A run that hits an approval step stops for good, and the runner refuses to start any graph containing an approval or agent step.

The database already knows `queued`, `running`, `awaiting_approval`, `succeeded`, `failed`, `cancelled`. The runner never uses most of it.

## Slice A: checkpointed runs, advanced by hand

A run becomes a stored position plus the outputs collected so far.

- Starting a run does not execute anything. It creates the run parked at step 1 with nothing done.
- You press "Run this step." Exactly one step executes, writes its result, and the run parks at the next step.
- Each step's real input and output are stored and visible before you decide to continue.
- A crash or reload never replays a finished step. The stored position is the only truth.
- Cancel parks the run permanently in `cancelled`, recording who and when.

Pause and resume stop being features: nothing advances unless you press next. The only control surface is step, cancel, and (later) an optional unattended mode.

**Done when:** a multi-step workflow can be started, advanced one step at a time with each result inspectable in between, and cancelled, with no step ever executing twice.

## Slice B: the manual run surface on the workflow page

Built on A. The existing step path becomes the control surface rather than a diagram.

- The current step is highlighted, with a clear "Run this step" action and what it will do, against which tool, with which inputs.
- Completed steps show their real output inline; upcoming steps show declared inputs only.
- Each step shows whether it mutates anything external, so a read step and a write step never look alike.
- Cancel and a full receipt of who advanced which step, and when.
- Read-only accounts see the same path with the actions disabled and the reason stated.

**Done when:** you can drive a full workflow to completion from the page, one press per step, and the audit trail names you on every one.

## Slice C: approval steps become just another manual step

Built on A. With manual stepping, an approval gate is a step whose action is a decision instead of a tool call.

- Reaching an approval step parks the run and files the exact payload to the Inbox.
- Approving from either the Inbox or the workflow page advances the same run from that point, carrying earlier outputs. No restart, no re-running finished steps.
- Rejecting closes the run with the decision recorded.
- The runner stops refusing graphs that contain approval steps.
- Fail closed: if identity, payload, or resume position cannot be proven, the run stays parked and says why.

**Done when:** a workflow with an approval gate parks, is decided from the Inbox, and continues from exactly where it stopped with a complete receipt.

## Unattended runs: kept, but narrowed

The scheduled observation workflows (Search Console daily, DataForSEO sweeps) already run without you and should keep doing so. Under manual-first they use the same engine with an "advance automatically while the next step is read only" flag. The moment a run reaches a step that changes something external, it parks and waits for you, regardless of how it was started.

## Not in scope here

Drag-and-drop step editing. Workflow graphs are declared in the registry files and synced to the database, so an in-page editor first needs a decision about which side wins when they disagree. Separate plan, after the engine is resumable.

## Suggested order

A, then B, then C. A alone is invisible; B is where manual stepping becomes real to you; C removes the last manual restart.

## Technical notes

- `workflow_runs` gains a cursor (next step index) and accumulated step outputs; `workflow_steps` rows are written per advance, not per run.
- `runWorkflow` in `src/lib/workflow-runner.server.ts` splits into `startRun` and `advanceRun(runId)`; per-node execution logic is reused unchanged.
- Advancing goes through a guarded database function, same pattern as `transition_change_request`, so position changes are atomic, single-flight, and audited.
- The scheduler hook calls `advanceRun` in a loop only for runs flagged auto-advance, and stops at the first mutating or approval step.
- `assertRunnableGraph` loses its approval refusal in Slice C; the agent-step refusal stays.
