-- Title/H1 proposals are concrete executable changes. Observations remain
-- evidence and cannot become approvals merely because a rule fired.
ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS proposal_kind text,
  ADD COLUMN IF NOT EXISTS proposal_payload jsonb,
  ADD COLUMN IF NOT EXISTS proposal_checksum text,
  ADD COLUMN IF NOT EXISTS approved_payload jsonb,
  ADD COLUMN IF NOT EXISTS approved_checksum text,
  ADD COLUMN IF NOT EXISTS approved_version_number integer,
  ADD COLUMN IF NOT EXISTS finding_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_proposal_shape CHECK (
    (
      proposal_kind IS NULL
      AND proposal_payload IS NULL
      AND proposal_checksum IS NULL
    )
    OR (
      proposal_kind = 'title_h1'
      AND jsonb_typeof(proposal_payload) = 'object'
      AND nullif(btrim(proposal_checksum), '') IS NOT NULL
    )
  ),
  ADD CONSTRAINT change_requests_approved_snapshot_shape CHECK (
    (
      approved_payload IS NULL
      AND approved_checksum IS NULL
      AND approved_version_number IS NULL
    )
    OR (
      proposal_kind = 'title_h1'
      AND jsonb_typeof(approved_payload) = 'object'
      AND nullif(btrim(approved_checksum), '') IS NOT NULL
      AND approved_version_number >= 0
    )
  ),
  ADD CONSTRAINT change_requests_title_h1_approval_requires_snapshot CHECK (
    proposal_kind IS DISTINCT FROM 'title_h1'
    OR ((approved_at IS NULL) = (approved_payload IS NULL))
  );

CREATE INDEX IF NOT EXISTS change_requests_finding_idx
  ON public.change_requests (tenant_id, finding_id)
  WHERE finding_id IS NOT NULL;

CREATE TABLE public.title_h1_proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_request_id uuid NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  creation_reason text NOT NULL CHECK (creation_reason IN ('edit', 'regenerate')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_checksum text NOT NULL CHECK (nullif(btrim(payload_checksum), '') IS NOT NULL),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, change_request_id, version_number)
);

CREATE INDEX title_h1_proposal_versions_request_idx
  ON public.title_h1_proposal_versions (tenant_id, change_request_id, version_number DESC);

GRANT SELECT, INSERT ON public.title_h1_proposal_versions TO authenticated;
GRANT ALL ON public.title_h1_proposal_versions TO service_role;
REVOKE ALL ON public.title_h1_proposal_versions FROM anon, PUBLIC;

ALTER TABLE public.title_h1_proposal_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read title H1 proposal versions"
  ON public.title_h1_proposal_versions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Operators create title H1 proposal versions"
  ON public.title_h1_proposal_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_operator()
    AND public.is_tenant_member(tenant_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.change_requests AS request
      WHERE request.id = change_request_id
        AND request.tenant_id = title_h1_proposal_versions.tenant_id
        AND request.proposal_kind = 'title_h1'
    )
  );

CREATE OR REPLACE FUNCTION public.refuse_title_h1_proposal_version_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Title/H1 proposal versions are immutable.';
END;
$$;

CREATE TRIGGER refuse_title_h1_proposal_version_update
  BEFORE UPDATE ON public.title_h1_proposal_versions
  FOR EACH ROW EXECUTE FUNCTION public.refuse_title_h1_proposal_version_update();

REVOKE ALL ON FUNCTION public.refuse_title_h1_proposal_version_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_approved_title_h1_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.approved_checksum IS NOT NULL AND (
    NEW.approved_payload IS DISTINCT FROM OLD.approved_payload
    OR NEW.approved_checksum IS DISTINCT FROM OLD.approved_checksum
    OR NEW.approved_version_number IS DISTINCT FROM OLD.approved_version_number
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'The approved title/H1 snapshot is immutable.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_approved_title_h1_snapshot
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_title_h1_snapshot();

REVOKE ALL ON FUNCTION public.protect_approved_title_h1_snapshot() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.replace_title_h1_proposal(
  _id uuid,
  _expected_checksum text,
  _payload jsonb,
  _payload_checksum text,
  _reason text
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.change_requests%ROWTYPE;
  v_version integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator or admin role required to change a title/H1 proposal.';
  END IF;
  IF _reason NOT IN ('edit', 'regenerate') THEN
    RAISE EXCEPTION 'Title/H1 proposal version reason must be edit or regenerate.';
  END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Title/H1 proposal payload must be an object.';
  END IF;
  v_version := (_payload ->> 'versionNumber')::integer;
  IF v_version IS NULL OR v_version <= 0 THEN
    RAISE EXCEPTION 'Title/H1 proposal version must be positive.';
  END IF;

  SELECT * INTO v_row
  FROM public.change_requests
  WHERE id = _id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_tenant_member(v_row.tenant_id) THEN
    RAISE EXCEPTION 'That title/H1 proposal is not visible to this account.';
  END IF;
  IF v_row.proposal_kind IS DISTINCT FROM 'title_h1' OR v_row.state IS DISTINCT FROM 'proposed' THEN
    RAISE EXCEPTION 'Only a proposed title/H1 change can be versioned.';
  END IF;
  IF v_row.proposal_checksum IS DISTINCT FROM _expected_checksum THEN
    RAISE EXCEPTION 'Proposal changed; refresh before editing.';
  END IF;
  IF v_version IS DISTINCT FROM COALESCE((v_row.proposal_payload ->> 'versionNumber')::integer, 0) + 1 THEN
    RAISE EXCEPTION 'Proposal version number is stale.';
  END IF;

  INSERT INTO public.title_h1_proposal_versions (
    tenant_id, change_request_id, version_number, creation_reason,
    payload, payload_checksum, created_by
  ) VALUES (
    v_row.tenant_id, v_row.id, v_version, _reason,
    _payload, _payload_checksum, v_uid
  );

  UPDATE public.change_requests
  SET proposal_payload = _payload,
      proposal_checksum = _payload_checksum
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_title_h1_proposal(
  _id uuid,
  _expected_checksum text
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.change_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator or admin role required to approve a title/H1 proposal.';
  END IF;

  SELECT * INTO v_row
  FROM public.change_requests
  WHERE id = _id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_tenant_member(v_row.tenant_id) THEN
    RAISE EXCEPTION 'That title/H1 proposal is not visible to this account.';
  END IF;
  IF v_row.proposal_kind IS DISTINCT FROM 'title_h1' OR v_row.state IS DISTINCT FROM 'proposed' THEN
    RAISE EXCEPTION 'Only a proposed title/H1 change can be approved.';
  END IF;
  IF v_row.proposal_checksum IS DISTINCT FROM _expected_checksum THEN
    RAISE EXCEPTION 'Proposal changed; refresh before approving.';
  END IF;
  IF v_row.approved_checksum IS NOT NULL THEN
    RAISE EXCEPTION 'This proposal already has an approved snapshot.';
  END IF;

  UPDATE public.change_requests
  SET state = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      approved_payload = proposal_payload,
      approved_checksum = proposal_checksum,
      approved_version_number = COALESCE((proposal_payload ->> 'versionNumber')::integer, 0)
  WHERE id = v_row.id
    AND state = 'proposed'
    AND proposal_checksum = _expected_checksum
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal changed; refresh before approving.';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_title_h1_proposal(uuid, text, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_title_h1_proposal(uuid, text, jsonb, text, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_title_h1_proposal(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_title_h1_proposal(uuid, text)
  TO authenticated, service_role;

-- Repair the rows created by the old observation-to-approval path without
-- deleting their evidence or history.
UPDATE public.recommendations
SET state = 'observed'::public.recommendation_state,
    requires_approval = false
WHERE metadata @> '{"observationOnly": true}'::jsonb;

UPDATE public.inbox_items AS item
SET lane = 'fyi'::public.inbox_lane,
    resolved_at = COALESCE(item.resolved_at, now()),
    actions = '[]'::jsonb
FROM public.recommendations AS recommendation
WHERE item.subject_kind = 'recommendation'
  AND item.subject_id = recommendation.id
  AND item.tenant_id = recommendation.tenant_id
  AND recommendation.metadata @> '{"observationOnly": true}'::jsonb
  AND item.resolved_at IS NULL;

ALTER TABLE public.recommendations
  ADD CONSTRAINT recommendations_observation_only_not_approvable CHECK (
    NOT (metadata @> '{"observationOnly": true}'::jsonb)
    OR (
      requires_approval = false
      AND state = 'observed'::public.recommendation_state
    )
  );
