CREATE TABLE public.operator_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  linked_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_notes TO authenticated;
GRANT ALL ON public.operator_notes TO service_role;

ALTER TABLE public.operator_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors manage their own notes"
  ON public.operator_notes FOR ALL TO authenticated
  USING (author_id = auth.uid() AND public.is_tenant_member(tenant_id))
  WITH CHECK (author_id = auth.uid() AND public.is_tenant_member(tenant_id));

CREATE TRIGGER operator_notes_touch_updated_at
  BEFORE UPDATE ON public.operator_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX operator_notes_tenant_author_idx
  ON public.operator_notes (tenant_id, author_id, pinned DESC, updated_at DESC);