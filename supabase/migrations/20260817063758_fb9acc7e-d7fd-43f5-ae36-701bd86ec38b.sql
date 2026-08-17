CREATE OR REPLACE FUNCTION public.append_change_measurement_observation(_cycle_id uuid, _window_id uuid, _provider text, _source_role text, _status text, _payload jsonb, _source_refs jsonb, _provenance jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cycle public.change_measurement_cycles%ROWTYPE; v_window public.change_measurement_windows%ROWTYPE; v_id uuid; v_prior uuid; v_revision integer; v_prior_status text; v_prior_payload jsonb; v_prior_refs jsonb;
BEGIN
  SELECT * INTO v_cycle FROM public.change_measurement_cycles WHERE id = _cycle_id;
  SELECT * INTO v_window FROM public.change_measurement_windows WHERE id = _window_id AND cycle_id = _cycle_id;
  IF v_cycle.id IS NULL OR v_window.id IS NULL THEN RAISE EXCEPTION 'Measurement cycle/window mismatch.'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(v_cycle.tenant_id) THEN
    RAISE EXCEPTION 'Not a member of this workspace.';
  END IF;
  IF _source_role IS DISTINCT FROM (CASE _provider
    WHEN 'live_page' THEN 'source_of_truth' WHEN 'gsc' THEN 'source_of_truth' WHEN 'ga4' THEN 'source_of_truth'
    WHEN 'dataforseo_organic' THEN 'enrichment' WHEN 'serpapi_transparency' THEN 'corroboration'
    WHEN 'serpapi_paid_serp' THEN 'corroboration' WHEN 'knowledge' THEN 'devils_advocate' ELSE NULL END) THEN
    RAISE EXCEPTION 'Provider role mismatch.';
  END IF;
  SELECT id, revision_number, status, payload, source_refs INTO v_prior, v_revision, v_prior_status, v_prior_payload, v_prior_refs FROM public.change_measurement_observations
    WHERE cycle_id=_cycle_id AND window_id=_window_id AND provider=_provider ORDER BY revision_number DESC LIMIT 1;
  IF v_prior IS NOT NULL AND v_prior_status = _status AND v_prior_payload = COALESCE(_payload,'{}') AND v_prior_refs = COALESCE(_source_refs,'[]') THEN RETURN v_prior; END IF;
  v_revision := COALESCE(v_revision, 0) + 1;
  INSERT INTO public.change_measurement_observations(tenant_id, cycle_id, window_id, provider, source_role, status, revision_number, supersedes_id, payload, source_refs, provenance)
  VALUES (v_cycle.tenant_id, _cycle_id, _window_id, _provider, _source_role, _status, v_revision, v_prior, COALESCE(_payload,'{}'), COALESCE(_source_refs,'[]'), COALESCE(_provenance,'{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_change_measurement_revision(_cycle_id uuid, _window_id uuid, _actor_id uuid, _kind text, _summary text, _detail jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.change_measurement_cycles WHERE id = _cycle_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Measurement cycle not found.'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'Not a member of this workspace.';
  END IF;
  INSERT INTO public.change_measurement_revisions(tenant_id,cycle_id,window_id,actor_id,kind,summary,detail)
  VALUES(v_tenant,_cycle_id,_window_id,_actor_id,_kind,_summary,COALESCE(_detail,'{}')) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.append_change_measurement_observation(uuid,uuid,text,text,text,jsonb,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_change_measurement_revision(uuid,uuid,uuid,text,text,jsonb) TO authenticated;