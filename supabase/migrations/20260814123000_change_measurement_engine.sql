-- Immutable, tenant-scoped measurement lifecycle for approved Title/H1 changes.
-- Sources stay separate: no blended score and no automatic success judgment.

ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS live_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS change_requests_id_tenant_unique ON public.change_requests(id, tenant_id);

CREATE TABLE public.change_measurement_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_request_id uuid NOT NULL,
  target_url text NOT NULL,
  gsc_property text,
  approved_at timestamptz NOT NULL,
  baseline_frozen_at timestamptz NOT NULL DEFAULT now(),
  live_at timestamptz,
  approval_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_request_id),
  UNIQUE (id, tenant_id),
  CONSTRAINT change_measurement_cycles_change_tenant_fkey
    FOREIGN KEY (change_request_id, tenant_id) REFERENCES public.change_requests(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE public.change_measurement_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL,
  window_days smallint NOT NULL CHECK (window_days IN (0, 7, 14, 28)),
  anchor_kind text NOT NULL CHECK (anchor_kind IN ('approval_baseline', 'rendered_live')),
  period_start_pt date NOT NULL,
  period_end_pt date NOT NULL,
  available_after_pt date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, window_days),
  UNIQUE (id, tenant_id),
  CONSTRAINT change_measurement_windows_cycle_tenant_fkey
    FOREIGN KEY (cycle_id, tenant_id) REFERENCES public.change_measurement_cycles(id, tenant_id) ON DELETE CASCADE,
  CHECK (period_end_pt >= period_start_pt)
);

CREATE TABLE public.change_measurement_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL,
  window_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('live_page','gsc','ga4','dataforseo_organic','serpapi_transparency','serpapi_paid_serp','knowledge')),
  source_role text NOT NULL CHECK (source_role IN ('source_of_truth','enrichment','corroboration','devils_advocate')),
  status text NOT NULL CHECK (status IN ('complete','empty','partial')),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  supersedes_id uuid REFERENCES public.change_measurement_observations(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, window_id, provider, revision_number),
  CONSTRAINT change_measurement_observations_cycle_tenant_fkey
    FOREIGN KEY (cycle_id, tenant_id) REFERENCES public.change_measurement_cycles(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT change_measurement_observations_window_tenant_fkey
    FOREIGN KEY (window_id, tenant_id) REFERENCES public.change_measurement_windows(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE public.change_measurement_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL,
  window_id uuid,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('operator_note','review_question','provider_correction','live_anchor')),
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_measurement_revisions_cycle_tenant_fkey
    FOREIGN KEY (cycle_id, tenant_id) REFERENCES public.change_measurement_cycles(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT change_measurement_revisions_window_tenant_fkey
    FOREIGN KEY (window_id, tenant_id) REFERENCES public.change_measurement_windows(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX change_measurement_cycles_tenant_change_idx ON public.change_measurement_cycles(tenant_id, change_request_id);
CREATE INDEX change_measurement_windows_tenant_due_idx ON public.change_measurement_windows(tenant_id, available_after_pt, window_days);
CREATE INDEX change_measurement_observations_history_idx ON public.change_measurement_observations(tenant_id, cycle_id, captured_at);
CREATE INDEX change_measurement_revisions_history_idx ON public.change_measurement_revisions(tenant_id, cycle_id, created_at);

ALTER TABLE public.change_measurement_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_measurement_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_measurement_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_measurement_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read measurement cycles" ON public.change_measurement_cycles FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read measurement windows" ON public.change_measurement_windows FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read measurement observations" ON public.change_measurement_observations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read measurement revisions" ON public.change_measurement_revisions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

REVOKE ALL ON public.change_measurement_cycles, public.change_measurement_windows, public.change_measurement_observations, public.change_measurement_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.change_measurement_cycles, public.change_measurement_windows, public.change_measurement_observations, public.change_measurement_revisions TO authenticated;
GRANT ALL ON public.change_measurement_cycles, public.change_measurement_windows, public.change_measurement_observations, public.change_measurement_revisions TO service_role;

CREATE OR REPLACE FUNCTION public.refuse_measurement_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Measurement history is append-only; append a revision instead.';
END;
$$;
CREATE TRIGGER refuse_measurement_window_mutation BEFORE UPDATE OR DELETE ON public.change_measurement_windows FOR EACH ROW EXECUTE FUNCTION public.refuse_measurement_history_mutation();
CREATE TRIGGER refuse_measurement_observation_mutation BEFORE UPDATE OR DELETE ON public.change_measurement_observations FOR EACH ROW EXECUTE FUNCTION public.refuse_measurement_history_mutation();
CREATE TRIGGER refuse_measurement_revision_mutation BEFORE UPDATE OR DELETE ON public.change_measurement_revisions FOR EACH ROW EXECUTE FUNCTION public.refuse_measurement_history_mutation();

CREATE OR REPLACE FUNCTION public.guard_change_measurement_anchor() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR OLD.change_request_id IS DISTINCT FROM NEW.change_request_id
     OR OLD.target_url IS DISTINCT FROM NEW.target_url OR OLD.gsc_property IS DISTINCT FROM NEW.gsc_property OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
     OR OLD.baseline_frozen_at IS DISTINCT FROM NEW.baseline_frozen_at OR OLD.approval_snapshot IS DISTINCT FROM NEW.approval_snapshot
     OR (OLD.live_at IS NOT NULL AND OLD.live_at IS DISTINCT FROM NEW.live_at) THEN
    RAISE EXCEPTION 'Measurement approval and live anchors are immutable.';
  END IF;
  IF OLD.live_at IS NULL AND NEW.live_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.change_requests WHERE id = NEW.change_request_id AND tenant_id = NEW.tenant_id AND published_proof_at = NEW.live_at
  ) THEN RAISE EXCEPTION 'The live anchor must equal the rendered published-proof timestamp.'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_change_measurement_anchor BEFORE UPDATE ON public.change_measurement_cycles FOR EACH ROW EXECUTE FUNCTION public.guard_change_measurement_anchor();

CREATE OR REPLACE FUNCTION public.capture_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_property text;
  v_approved_date date;
  v_live_date date;
BEGIN
  IF NEW.proposal_type <> 'title_h1' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.live_at IS NOT NULL AND NEW.live_at IS DISTINCT FROM OLD.live_at THEN
    RAISE EXCEPTION 'The rendered live anchor is immutable.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published_proof_at IS NULL AND NEW.published_proof_at IS NOT NULL THEN
    NEW.live_at := NEW.published_proof_at;
  ELSIF TG_OP = 'UPDATE' AND OLD.live_at IS NULL AND NEW.live_at IS NOT NULL THEN
    RAISE EXCEPTION 'The live anchor can only be set by a rendered published proof.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_change_measurement_anchor BEFORE UPDATE ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.capture_change_measurement_lifecycle();

CREATE OR REPLACE FUNCTION public.materialize_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_property text;
  v_approved_date date;
  v_live_date date;
BEGIN
  IF NEW.proposal_type <> 'title_h1' THEN RETURN NEW; END IF;
  IF NEW.approved_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.approved_at IS NULL) THEN
    SELECT site_url INTO v_property FROM public.search_console_properties WHERE tenant_id = NEW.tenant_id AND selected = true LIMIT 1;
    INSERT INTO public.change_measurement_cycles(tenant_id, change_request_id, target_url, gsc_property, approved_at, approval_snapshot)
    VALUES (NEW.tenant_id, NEW.id, NEW.target_url, v_property, NEW.approved_at,
      jsonb_build_object('changes', NEW.changes, 'evidence', NEW.evidence, 'generationContext', NEW.generation_context,
        'verificationBaseline', NEW.verification_baseline, 'sourceRevision', NEW.source_revision_before))
    ON CONFLICT (change_request_id) DO NOTHING RETURNING id INTO v_cycle_id;
    IF v_cycle_id IS NULL THEN SELECT id INTO v_cycle_id FROM public.change_measurement_cycles WHERE change_request_id = NEW.id; END IF;
    v_approved_date := (NEW.approved_at AT TIME ZONE 'America/Los_Angeles')::date;
    INSERT INTO public.change_measurement_windows(tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt)
    VALUES (NEW.tenant_id, v_cycle_id, 0, 'approval_baseline', v_approved_date - 28, v_approved_date - 1, v_approved_date)
    ON CONFLICT (cycle_id, window_days) DO NOTHING;
  END IF;
  IF NEW.live_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.live_at IS NULL) THEN
    SELECT id INTO v_cycle_id FROM public.change_measurement_cycles WHERE change_request_id = NEW.id;
    IF v_cycle_id IS NULL THEN RAISE EXCEPTION 'A rendered live anchor requires an immutable approval baseline.'; END IF;
    UPDATE public.change_measurement_cycles SET live_at = NEW.live_at WHERE id = v_cycle_id AND live_at IS NULL;
    v_live_date := (NEW.live_at AT TIME ZONE 'America/Los_Angeles')::date;
    INSERT INTO public.change_measurement_windows(tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt)
    VALUES
      (NEW.tenant_id, v_cycle_id, 7, 'rendered_live', v_live_date + 1, v_live_date + 7, v_live_date + 8),
      (NEW.tenant_id, v_cycle_id, 14, 'rendered_live', v_live_date + 1, v_live_date + 14, v_live_date + 15),
      (NEW.tenant_id, v_cycle_id, 28, 'rendered_live', v_live_date + 1, v_live_date + 28, v_live_date + 29)
    ON CONFLICT (cycle_id, window_days) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER materialize_change_measurement_lifecycle AFTER INSERT OR UPDATE ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.materialize_change_measurement_lifecycle();
