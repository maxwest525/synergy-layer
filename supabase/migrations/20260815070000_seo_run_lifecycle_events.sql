CREATE OR REPLACE FUNCTION public.sync_seo_run_change_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_state text;
  run_summary text;
  event_actor uuid;
BEGIN
  run_state := CASE NEW.state
    WHEN 'proposed' THEN 'awaiting_approval'
    WHEN 'approved' THEN 'approved'
    WHEN 'applied' THEN 'executed'
    WHEN 'verified' THEN 'verified'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'rolled_back' THEN 'rolled_back'
    ELSE NULL
  END;

  run_summary := CASE NEW.state
    WHEN 'proposed' THEN 'The concrete proposal is awaiting operator approval.'
    WHEN 'approved' THEN 'An operator approved the proposal. No execution is implied.'
    WHEN 'applied' THEN 'The approved source change was executed.'
    WHEN 'verified' THEN 'An operator verified the change against outcome evidence.'
    WHEN 'rejected' THEN 'An operator rejected the proposal. No execution occurred.'
    WHEN 'rolled_back' THEN 'An operator recorded that the executed change was rolled back.'
    ELSE NULL
  END;

  event_actor := CASE NEW.state
    WHEN 'approved' THEN NEW.approved_by
    WHEN 'applied' THEN NEW.applied_by
    WHEN 'verified' THEN NEW.verified_by
    WHEN 'rejected' THEN NEW.rejected_by
    WHEN 'rolled_back' THEN NEW.rolled_back_by
    ELSE NULL
  END;

  IF run_state IS NOT NULL THEN
    UPDATE public.seo_runs
    SET state = run_state,
        completed_at = CASE
          WHEN run_state IN ('verified','rejected','rolled_back') THEN now()
          ELSE completed_at
        END
    WHERE tenant_id = NEW.tenant_id
      AND change_request_id = NEW.id;

    INSERT INTO public.seo_run_events (
      tenant_id,
      run_id,
      event_key,
      state,
      summary,
      payload,
      actor_id
    )
    SELECT
      run.tenant_id,
      run.id,
      'change_state:' || NEW.state,
      run_state,
      run_summary,
      jsonb_build_object('change_request_id', NEW.id, 'change_state', NEW.state),
      event_actor
    FROM public.seo_runs AS run
    WHERE run.tenant_id = NEW.tenant_id
      AND run.change_request_id = NEW.id
    ON CONFLICT (tenant_id, run_id, event_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
