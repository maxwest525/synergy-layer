-- The two declared agents that could not run are gone.
--
-- Backlog CODE-14. `growth.analyst` and `content.strategist` were registry
-- declarations synced into `agents` and rendered at /agents as if they could
-- be run, while `runAgent()` throws on every call and `assertRunnableGraph`
-- refuses any graph holding an agent node. Both also pinned a model slug the
-- model layer exists to avoid pinning. The declarations leave the registry in
-- the same change; the sync only upserts, so the two rows leave here. Their
-- capability links cascade (registry-derived, not history); the twelve
-- activity rows that name them stay, as history does.
--
-- The two workflows built on them (`growth.weekly_scan`,
-- `content.brief_pipeline`) are not deleted: each has two recorded runs that
-- would cascade with the row, and run history is not deleted here. Their
-- declarations leave the registry too; the rows stay paused, the runner keeps
-- refusing them by name, and CURRENT_BUILD.md lists them with the other
-- undeclared rows for a later decision.
-- Rollback: re-add the two declarations and sync the registry.
DELETE FROM public.agents
 WHERE key IN ('growth.analyst', 'content.strategist');
