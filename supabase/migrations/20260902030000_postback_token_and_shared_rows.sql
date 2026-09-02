-- A callback is authenticated by something only the task knows, and a row
-- with no tenant belongs to the admins.
--
-- Security review 2026-09-02, SEC-1 and SEC-5 (backlog CODE-34, CODE-36).
-- Every statement is idempotent; nothing is dropped and no row changes.

-- ---------------------------------------------------------------------------
-- 1. One random token per DataForSEO task, stored as its hash.
--
-- The Standard-queue postback carried the project's publishable key, which
-- ships in the browser bundle, so any caller who read it passed the gate and
-- triggered a service-role lookup. From now on `queueSerpTasks` mints a
-- token per task, puts it in the postback URL, and stores its SHA-256 here;
-- the receiver hashes what it is handed, looks the task up by hash, and
-- refuses a body that is not about that task. Tasks queued before this
-- column existed have no hash: there are none in flight (40 received, 1
-- retired on 2026-09-02), and a callback for one would now be refused.
-- Rollback: DROP INDEX, DROP COLUMN, and the previous receiver.
-- ---------------------------------------------------------------------------
ALTER TABLE public.dataforseo_serp_tasks
  ADD COLUMN IF NOT EXISTS postback_token_hash text;

COMMENT ON COLUMN public.dataforseo_serp_tasks.postback_token_hash IS
  'SHA-256 of the per-task token carried in the postback URL. The token itself is never stored.';

CREATE UNIQUE INDEX IF NOT EXISTS dataforseo_serp_tasks_postback_token_hash_key
  ON public.dataforseo_serp_tasks (postback_token_hash)
  WHERE postback_token_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Audit rows with no tenant are readable by admins and their actor, and
--    rows with no tenant are written by admins alone.
--
-- `is_tenant_member(NULL)` is true by design, so shared rows (a workspace-
-- less knowledge collection, a schedule template) read for every member.
-- That same rule let every authenticated account read the auth and MCP
-- audit rows the server files without a tenant, and let any operator of any
-- workspace rewrite the shared rows. The reads now distinguish the two
-- cases, and a write to a row with no tenant needs the admin role. The
-- server now files auth and MCP audit rows with the operator's active
-- workspace, so new rows are tenant-scoped; the two rows already stored
-- without one are the admins' to read.
-- Rollback: re-create the three policies as they stood (20260810101243 for
-- activity, 20260814150000 for knowledge collections, 20260805042451 for
-- schedules).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS activity_read ON public.activity_events;
CREATE POLICY activity_read ON public.activity_events FOR SELECT TO authenticated
  USING (
    (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id))
    OR (
      tenant_id IS NULL
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR actor_id = auth.uid()::text
        OR subject_id::text = auth.uid()::text
      )
    )
  );

DROP POLICY IF EXISTS activity_write ON public.activity_events;
CREATE POLICY activity_write ON public.activity_events FOR ALL TO authenticated
  USING (
    public.is_operator() AND public.is_tenant_member(tenant_id)
    AND (tenant_id IS NOT NULL OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_operator() AND public.is_tenant_member(tenant_id)
    AND (tenant_id IS NOT NULL OR public.has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS kcoll_write ON public.knowledge_collections;
CREATE POLICY kcoll_write ON public.knowledge_collections FOR ALL TO authenticated
  USING (
    public.is_operator() AND public.is_tenant_member(tenant_id)
    AND (tenant_id IS NOT NULL OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_operator() AND public.is_tenant_member(tenant_id)
    AND (tenant_id IS NOT NULL OR public.has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS sched_write ON public.schedules;
CREATE POLICY sched_write ON public.schedules FOR ALL TO authenticated
  USING (
    public.is_operator() AND public.is_tenant_member(tenant_id)
    AND (tenant_id IS NOT NULL OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_operator() AND public.is_tenant_member(tenant_id)
    AND (tenant_id IS NOT NULL OR public.has_role(auth.uid(), 'admin'::app_role))
  );
