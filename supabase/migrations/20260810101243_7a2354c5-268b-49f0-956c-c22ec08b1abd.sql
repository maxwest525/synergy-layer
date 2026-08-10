-- 1. Tenants and membership
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status public.entity_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _tenant_id IS NULL
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = _tenant_id AND m.user_id = auth.uid())
$$;

CREATE POLICY tenants_read ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(id));
CREATE POLICY tenants_admin ON public.tenants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tenant_members_read ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY tenant_members_admin ON public.tenant_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER touch_tenants BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Per-tenant connector credentials (secret references only, never raw values)
CREATE TABLE public.tenant_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  provider text NOT NULL,
  integration_state text NOT NULL DEFAULT 'pending',
  secret_name text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  health public.health_state NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, capability_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_connections TO authenticated;
GRANT ALL ON public.tenant_connections TO service_role;
ALTER TABLE public.tenant_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_connections_read ON public.tenant_connections FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY tenant_connections_write ON public.tenant_connections FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE TRIGGER touch_tenant_connections BEFORE UPDATE ON public.tenant_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Seed the first tenant and backfill existing data into it
INSERT INTO public.tenants (slug, name, description)
VALUES ('trumove', 'TruMove', 'TruMove Inc. production marketing operations.');

INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, r.user_id, r.role FROM public.tenants t, public.user_roles r WHERE t.slug = 'trumove'
ON CONFLICT DO NOTHING;

-- Active tenant for the operator UI switcher
ALTER TABLE public.profiles ADD COLUMN active_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
UPDATE public.profiles SET active_tenant_id = (SELECT id FROM public.tenants WHERE slug='trumove');

-- 4. Tenant-scoped data tables (isolated), backfilled then made NOT NULL
ALTER TABLE public.assets ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.inbox_items ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.recommendations ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_runs ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_steps ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_entries ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.search_console_properties ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.search_console_snapshots ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.search_console_observations ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Nullable: NULL means shared registry definition available to every tenant
ALTER TABLE public.knowledge_collections ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.activity_events ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM public.tenants WHERE slug = 'trumove';
  UPDATE public.assets SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.inbox_items SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.recommendations SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.workflow_runs SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.workflow_steps SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.knowledge_entries SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.search_console_properties SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.search_console_snapshots SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.search_console_observations SET tenant_id = t WHERE tenant_id IS NULL;
  UPDATE public.activity_events SET tenant_id = t WHERE tenant_id IS NULL;
END $$;

ALTER TABLE public.assets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.inbox_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.recommendations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.workflow_runs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.workflow_steps ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.knowledge_entries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.search_console_properties ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.search_console_snapshots ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.search_console_observations ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX idx_assets_tenant ON public.assets(tenant_id);
CREATE INDEX idx_inbox_tenant ON public.inbox_items(tenant_id);
CREATE INDEX idx_reco_tenant ON public.recommendations(tenant_id);
CREATE INDEX idx_runs_tenant ON public.workflow_runs(tenant_id);
CREATE INDEX idx_steps_tenant ON public.workflow_steps(tenant_id);
CREATE INDEX idx_kentries_tenant ON public.knowledge_entries(tenant_id);
CREATE INDEX idx_scs_tenant ON public.search_console_snapshots(tenant_id);
CREATE INDEX idx_activity_tenant ON public.activity_events(tenant_id);

-- 5. Uniqueness becomes per tenant
ALTER TABLE public.search_console_properties DROP CONSTRAINT search_console_properties_site_url_key;
ALTER TABLE public.search_console_properties ADD CONSTRAINT scp_tenant_site_url_key UNIQUE (tenant_id, site_url);
ALTER TABLE public.search_console_observations DROP CONSTRAINT search_console_observations_observation_fingerprint_key;
ALTER TABLE public.search_console_observations ADD CONSTRAINT sco_tenant_fingerprint_key UNIQUE (tenant_id, observation_fingerprint);
ALTER TABLE public.knowledge_collections DROP CONSTRAINT knowledge_collections_key_key;
CREATE UNIQUE INDEX kc_tenant_key ON public.knowledge_collections(tenant_id, key) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX kc_shared_key ON public.knowledge_collections(key) WHERE tenant_id IS NULL;
ALTER TABLE public.schedules DROP CONSTRAINT schedules_key_key;
CREATE UNIQUE INDEX sched_tenant_key ON public.schedules(tenant_id, key) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX sched_shared_key ON public.schedules(key) WHERE tenant_id IS NULL;

-- 6. Tenant-scoped RLS replacing the open policies on isolated tables
DROP POLICY "read assets" ON public.assets;
DROP POLICY "operators manage assets" ON public.assets;
CREATE POLICY assets_read ON public.assets FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY assets_write ON public.assets FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read inbox_items" ON public.inbox_items;
DROP POLICY "operators manage inbox_items" ON public.inbox_items;
CREATE POLICY inbox_read ON public.inbox_items FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY inbox_write ON public.inbox_items FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read recommendations" ON public.recommendations;
DROP POLICY "operators manage recommendations" ON public.recommendations;
CREATE POLICY reco_read ON public.recommendations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY reco_write ON public.recommendations FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read workflow_runs" ON public.workflow_runs;
DROP POLICY "operators manage workflow_runs" ON public.workflow_runs;
CREATE POLICY runs_read ON public.workflow_runs FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY runs_write ON public.workflow_runs FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read workflow_steps" ON public.workflow_steps;
DROP POLICY "operators manage workflow_steps" ON public.workflow_steps;
CREATE POLICY steps_read ON public.workflow_steps FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY steps_write ON public.workflow_steps FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read knowledge_entries" ON public.knowledge_entries;
DROP POLICY "operators manage knowledge_entries" ON public.knowledge_entries;
CREATE POLICY kentries_read ON public.knowledge_entries FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY kentries_write ON public.knowledge_entries FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY scp_read ON public.search_console_properties;
DROP POLICY scp_write ON public.search_console_properties;
CREATE POLICY scp_read ON public.search_console_properties FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY scp_write ON public.search_console_properties FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY scs_read ON public.search_console_snapshots;
DROP POLICY scs_write ON public.search_console_snapshots;
CREATE POLICY scs_read ON public.search_console_snapshots FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY scs_write ON public.search_console_snapshots FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY sco_read ON public.search_console_observations;
DROP POLICY sco_write ON public.search_console_observations;
CREATE POLICY sco_read ON public.search_console_observations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY sco_write ON public.search_console_observations FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read knowledge_collections" ON public.knowledge_collections;
DROP POLICY "operators manage knowledge_collections" ON public.knowledge_collections;
CREATE POLICY kcoll_read ON public.knowledge_collections FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY kcoll_write ON public.knowledge_collections FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read schedules" ON public.schedules;
DROP POLICY "operators manage schedules" ON public.schedules;
CREATE POLICY sched_read ON public.schedules FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY sched_write ON public.schedules FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY "read activity_events" ON public.activity_events;
DROP POLICY "operators manage activity_events" ON public.activity_events;
CREATE POLICY activity_read ON public.activity_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY activity_write ON public.activity_events FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));