CREATE OR REPLACE FUNCTION public.claim_workflow_run_step(p_run_id uuid, p_actor uuid)
RETURNS TABLE (run_id uuid, step_cursor integer, total_steps integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.workflow_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found';
  END IF;
  IF NOT public.is_tenant_member(v_run.tenant_id) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Not permitted for this tenant';
  END IF;

  -- A run left in 'running' by a crashed step is recoverable only after it has
  -- clearly stopped moving. Anything sooner could double-execute a live step.
  IF v_run.state = 'running'
     AND (v_run.last_advanced_at IS NULL OR v_run.last_advanced_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'This run is already advancing a step';
  END IF;

  IF v_run.state NOT IN ('queued','awaiting_approval','running') THEN
    RAISE EXCEPTION 'Run is % and cannot be advanced', v_run.state;
  END IF;
  IF v_run.cursor >= v_run.total_steps THEN
    RAISE EXCEPTION 'Run has no remaining steps';
  END IF;

  UPDATE public.workflow_runs
     SET state = 'running',
         last_advanced_at = now(),
         last_advanced_by = p_actor,
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = p_run_id;

  run_id := v_run.id;
  step_cursor := v_run.cursor;
  total_steps := v_run.total_steps;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workflow_run_step(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_workflow_run_step(uuid, uuid) TO authenticated, service_role;