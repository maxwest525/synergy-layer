CREATE TABLE public.tool_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stable_key text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('local_app','mcp','api','connector','repository','adapter','vault')),
  provider text,
  version text,
  execution_location text NOT NULL DEFAULT 'local' CHECK (execution_location IN ('local','cloud','remote')),
  discovered_from text,
  installed_state text NOT NULL DEFAULT 'unknown' CHECK (installed_state IN ('unknown','discovered','installed','not_installed')),
  credential_state text NOT NULL DEFAULT 'unknown' CHECK (credential_state IN ('unknown','none','configured','encrypted_not_enumerated')),
  verification_state text NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','partially_live_proven','live_proven','surface_counted')),
  aoos_connection_state text NOT NULL DEFAULT 'not_connected' CHECK (aoos_connection_state IN ('not_connected','callable','queued')),
  last_verified_at date,
  source_reference text,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stable_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_systems TO authenticated;
GRANT ALL ON public.tool_systems TO service_role;
ALTER TABLE public.tool_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tool systems" ON public.tool_systems FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Operators write tool systems" ON public.tool_systems FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) AND public.is_operator()) WITH CHECK (public.is_tenant_member(tenant_id) AND public.is_operator());

CREATE TABLE public.tool_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.tool_systems(id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  display_name text NOT NULL,
  operation_mode text NOT NULL CHECK (operation_mode IN ('read','draft','write','admin','internal')),
  mutates_external_state boolean NOT NULL DEFAULT false,
  cost_model text NOT NULL DEFAULT 'unknown' CHECK (cost_model IN ('free','metered','unknown','provider_quota')),
  http_method text,
  mcp_tool_name text,
  notes text,
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, system_id, operation_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_operations TO authenticated;
GRANT ALL ON public.tool_operations TO service_role;
ALTER TABLE public.tool_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tool operations" ON public.tool_operations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Operators write tool operations" ON public.tool_operations FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) AND public.is_operator()) WITH CHECK (public.is_tenant_member(tenant_id) AND public.is_operator());

CREATE TABLE public.tool_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.tool_systems(id) ON DELETE CASCADE,
  alias_key text NOT NULL,
  alias_label text NOT NULL,
  registered_in text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, alias_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_aliases TO authenticated;
GRANT ALL ON public.tool_aliases TO service_role;
ALTER TABLE public.tool_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tool aliases" ON public.tool_aliases FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Operators write tool aliases" ON public.tool_aliases FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) AND public.is_operator()) WITH CHECK (public.is_tenant_member(tenant_id) AND public.is_operator());

CREATE INDEX tool_operations_system_idx ON public.tool_operations (system_id);
CREATE INDEX tool_aliases_system_idx ON public.tool_aliases (system_id);

CREATE TRIGGER touch_tool_systems BEFORE UPDATE ON public.tool_systems FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_tool_operations BEFORE UPDATE ON public.tool_operations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();