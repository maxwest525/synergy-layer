
-- ===== enums =====
CREATE TYPE public.app_role AS ENUM ('admin','operator','viewer');
CREATE TYPE public.entity_status AS ENUM ('draft','active','paused','archived','error');
CREATE TYPE public.health_state AS ENUM ('unknown','healthy','degraded','failing');
CREATE TYPE public.asset_kind AS ENUM ('website','landing_page','research_dataset','blog','google_ads_account','google_business_profile','github_repository','supabase_project','domain','workflow','knowledge_collection','prompt','email_campaign','social_account');
CREATE TYPE public.capability_kind AS ENUM ('mcp','api','connector','skill','repository','model','internal_module','service');
CREATE TYPE public.knowledge_kind AS ENUM ('documents','repositories','skills','prompts','playbooks','research','design_systems','best_practices','agent_knowledge','memory','vector_collection');
CREATE TYPE public.memory_scope AS ENUM ('none','task','asset','global');
CREATE TYPE public.run_state AS ENUM ('queued','running','awaiting_approval','succeeded','failed','cancelled');
CREATE TYPE public.recommendation_state AS ENUM ('draft','proposed','under_review','approved','rejected','scheduled','applied','verified','failed','rolled_back');
CREATE TYPE public.impact_level AS ENUM ('none','low','medium','high','critical');
CREATE TYPE public.inbox_lane AS ENUM ('needs_attention','pending_approval','scheduled','completed','fyi');
CREATE TYPE public.dependency_condition AS ENUM ('on_success','on_complete');

-- ===== roles =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','operator')
  )
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== core tables =====
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.asset_kind NOT NULL,
  name text NOT NULL,
  description text,
  owner_label text,
  external_ref text,
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_state NOT NULL DEFAULT 'unknown',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  kind public.capability_kind NOT NULL,
  category text,
  auth_kind text,
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  integration_state text NOT NULL DEFAULT 'pending',
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_state NOT NULL DEFAULT 'unknown',
  last_run_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.capability_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  depends_on_capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  UNIQUE (capability_id, depends_on_capability_id)
);

CREATE TABLE public.knowledge_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  kind public.knowledge_kind NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_state NOT NULL DEFAULT 'healthy',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.knowledge_collections(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  source_ref text,
  tags text[] NOT NULL DEFAULT '{}',
  embedding_ref text,
  status public.entity_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  trigger_kind text NOT NULL DEFAULT 'manual',
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_state NOT NULL DEFAULT 'unknown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  purpose text,
  description text,
  model text,
  current_objective text,
  current_task text,
  assigned_workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  last_result jsonb,
  last_run_at timestamptz,
  memory_scope public.memory_scope NOT NULL DEFAULT 'task',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_state NOT NULL DEFAULT 'unknown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  grant_scope text NOT NULL DEFAULT 'read',
  UNIQUE (agent_id, capability_id)
);

CREATE TABLE public.agent_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.knowledge_collections(id) ON DELETE CASCADE,
  access text NOT NULL DEFAULT 'read',
  UNIQUE (agent_id, collection_id)
);

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  state public.run_state NOT NULL DEFAULT 'queued',
  trigger_source text NOT NULL DEFAULT 'manual',
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  error text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  node_kind text NOT NULL,
  ref text,
  state public.run_state NOT NULL DEFAULT 'queued',
  sequence integer NOT NULL DEFAULT 0,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  source_module text NOT NULL DEFAULT 'system',
  business_impact public.impact_level NOT NULL DEFAULT 'medium',
  revenue_impact public.impact_level NOT NULL DEFAULT 'none',
  traffic_impact public.impact_level NOT NULL DEFAULT 'none',
  time_saved_minutes integer NOT NULL DEFAULT 0,
  risk public.impact_level NOT NULL DEFAULT 'low',
  confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  reasoning text,
  suggested_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  state public.recommendation_state NOT NULL DEFAULT 'proposed',
  approved_by uuid,
  approved_at timestamptz,
  run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recommendation_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  subject_kind text NOT NULL,
  subject_id uuid NOT NULL
);

CREATE TABLE public.recommendation_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  depends_on_recommendation_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  UNIQUE (recommendation_id, depends_on_recommendation_id)
);

CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cron text NOT NULL,
  target_kind text NOT NULL DEFAULT 'workflow',
  target_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_duration_ms integer,
  last_state public.run_state,
  failure_count integer NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_state NOT NULL DEFAULT 'unknown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.schedule_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  depends_on_schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  condition public.dependency_condition NOT NULL DEFAULT 'on_success',
  UNIQUE (schedule_id, depends_on_schedule_id)
);

CREATE TABLE public.inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lane public.inbox_lane NOT NULL DEFAULT 'fyi',
  source_module text NOT NULL,
  subject_kind text,
  subject_id uuid,
  title text NOT NULL,
  summary text,
  priority integer NOT NULL DEFAULT 3,
  assignee_label text,
  due_at timestamptz,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind text NOT NULL DEFAULT 'system',
  actor_id text,
  verb text NOT NULL,
  subject_kind text,
  subject_id uuid,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- ===== grants, rls, policies =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'assets','capabilities','capability_dependencies','knowledge_collections','knowledge_entries',
    'workflows','agents','agent_capabilities','agent_knowledge','workflow_runs','workflow_steps',
    'recommendations','recommendation_targets','recommendation_dependencies','schedules',
    'schedule_dependencies','inbox_items','activity_events'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read %1$s" ON public.%1$I FOR SELECT TO anon, authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "operators manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'assets','capabilities','knowledge_collections','knowledge_entries','workflows','agents',
    'workflow_runs','workflow_steps','recommendations','schedules','inbox_items'
  ] LOOP
    EXECUTE format('CREATE TRIGGER touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
  END LOOP;
END $$;

-- ===== seed =====
INSERT INTO public.assets (kind, name, description, owner_label, external_ref, health) VALUES
 ('website','Primary marketing site','Public company website and lead capture surface.','Marketing Ops','https://example.com','healthy'),
 ('github_repository','aoos-platform','Repository backing the operating system itself.','Platform','github.com/aoos/aoos-platform','healthy'),
 ('supabase_project','AOOS Cloud','Backend database, auth, and storage for the operating system.','Platform',NULL,'healthy'),
 ('google_ads_account','Google Ads — Core','Paid search account pending connection.','Growth',NULL,'unknown'),
 ('google_business_profile','Google Business Profile','Local presence profile pending connection.','Growth',NULL,'unknown'),
 ('research_dataset','Competitor snapshot Q3','Structured competitor research dataset.','Research',NULL,'healthy'),
 ('domain','example.com','Primary registered domain.','Platform',NULL,'healthy'),
 ('knowledge_collection','Brand system','Design system and brand rules collection.','Brand','design-system','healthy');

INSERT INTO public.capabilities (key, name, description, kind, category, auth_kind, integration_state, health) VALUES
 ('cap.github','GitHub','Repository, branch, and pull request operations.','connector','source_control','oauth','pending','unknown'),
 ('cap.supabase','Cloud Database','Managed Postgres, auth, and storage for the platform.','service','infrastructure','service_key','real','healthy'),
 ('cap.ai_gateway','AI Gateway','Model access for agent reasoning and generation.','model','intelligence','managed','real','healthy'),
 ('cap.n8n','n8n','External automation runtime for long-running jobs.','mcp','automation','api_key','pending','unknown'),
 ('cap.web_research','Web Research','Fetch and summarise public web pages.','api','research','api_key','pending','unknown'),
 ('cap.knowledge_retrieval','Knowledge Retrieval','Read entries from knowledge collections.','internal_module','knowledge','internal','real','healthy'),
 ('cap.workflow_runner','Workflow Runner','Execute workflow graphs and record steps.','internal_module','orchestration','internal','real','healthy'),
 ('cap.design_system','Design System','Shared component and token library.','skill','design','internal','real','healthy');

INSERT INTO public.knowledge_collections (key, name, description, kind) VALUES
 ('kb.documents','Documents','Operating documents and reference material.','documents'),
 ('kb.repositories','Repositories','Indexed repository knowledge.','repositories'),
 ('kb.skills','Skills','Reusable agent skills.','skills'),
 ('kb.prompts','Prompt Library','Approved prompts and templates.','prompts'),
 ('kb.playbooks','Playbooks','Operational playbooks and runbooks.','playbooks'),
 ('kb.research','Research','Research findings and datasets.','research'),
 ('kb.design_systems','Design Systems','Brand and interface standards.','design_systems'),
 ('kb.best_practices','Best Practices','Engineering and marketing standards.','best_practices'),
 ('kb.agent_knowledge','Agent Knowledge','Context packs bound to agents.','agent_knowledge'),
 ('kb.memory','Memory','Durable agent memory records.','memory'),
 ('kb.vectors','Vector Collections','Embedded corpora for retrieval.','vector_collection');

INSERT INTO public.knowledge_entries (collection_id, title, body, tags)
SELECT id, 'Operating principles', 'Nothing deploys without an approved recommendation. Every mutation writes an activity event. Capabilities are registered, never hardcoded.', ARRAY['core','governance']
FROM public.knowledge_collections WHERE key = 'kb.best_practices';
INSERT INTO public.knowledge_entries (collection_id, title, body, tags)
SELECT id, 'Interface standards', 'Dark surface, green accent, outlined controls, dense tables, status shown as dot plus label.', ARRAY['design']
FROM public.knowledge_collections WHERE key = 'kb.design_systems';
INSERT INTO public.knowledge_entries (collection_id, title, body, tags)
SELECT id, 'Research refresh brief', 'Collect competitor positioning, pricing, and publishing cadence weekly. Return structured findings only.', ARRAY['research','prompt']
FROM public.knowledge_collections WHERE key = 'kb.prompts';

INSERT INTO public.workflows (key, name, description, trigger_kind, graph) VALUES
 ('wf.research_refresh','Research refresh','Collect and normalise competitor and market research.','schedule',
  '{"nodes":[{"key":"collect","kind":"capability","ref":"cap.web_research"},{"key":"summarise","kind":"agent","ref":"agent.research"},{"key":"store","kind":"capability","ref":"cap.knowledge_retrieval"}],"edges":[{"from":"collect","to":"summarise"},{"from":"summarise","to":"store"}]}'::jsonb),
 ('wf.seo_validation','SEO validation','Validate refreshed research against on-site signals.','schedule',
  '{"nodes":[{"key":"load","kind":"capability","ref":"cap.knowledge_retrieval"},{"key":"validate","kind":"agent","ref":"agent.research"}],"edges":[{"from":"load","to":"validate"}]}'::jsonb),
 ('wf.content_generation','Content generation','Draft content from validated research.','schedule',
  '{"nodes":[{"key":"context","kind":"capability","ref":"cap.knowledge_retrieval"},{"key":"draft","kind":"agent","ref":"agent.research"},{"key":"review","kind":"approval","ref":"content_review"}],"edges":[{"from":"context","to":"draft"},{"from":"draft","to":"review"}]}'::jsonb),
 ('wf.publish','Publish','Publish approved content to its asset.','manual',
  '{"nodes":[{"key":"publish","kind":"capability","ref":"cap.github"}],"edges":[]}'::jsonb);

INSERT INTO public.agents (key, name, purpose, description, model, current_objective, current_task, memory_scope, assigned_workflow_id)
SELECT 'agent.research','Research Analyst','Maintain an accurate, current view of the competitive landscape.',
  'Reference agent proving the capability, knowledge, and approval contract end to end.',
  'google/gemini-3.5-flash','Keep the competitor snapshot current','Idle','asset', w.id
FROM public.workflows w WHERE w.key = 'wf.research_refresh';

INSERT INTO public.agent_capabilities (agent_id, capability_id, grant_scope)
SELECT a.id, c.id, 'read' FROM public.agents a, public.capabilities c
WHERE a.key = 'agent.research' AND c.key IN ('cap.knowledge_retrieval','cap.web_research');

INSERT INTO public.agent_knowledge (agent_id, collection_id, access)
SELECT a.id, k.id, 'read' FROM public.agents a, public.knowledge_collections k
WHERE a.key = 'agent.research' AND k.key IN ('kb.research','kb.prompts','kb.best_practices');

INSERT INTO public.schedules (key, name, description, cron, target_kind, target_id)
SELECT 'sch.research_refresh','Research refresh','Weekly competitor and market refresh.','0 6 * * 1','workflow', id FROM public.workflows WHERE key='wf.research_refresh';
INSERT INTO public.schedules (key, name, description, cron, target_kind, target_id)
SELECT 'sch.seo_validation','SEO validation','Runs after research refresh completes.','0 7 * * 1','workflow', id FROM public.workflows WHERE key='wf.seo_validation';
INSERT INTO public.schedules (key, name, description, cron, target_kind, target_id)
SELECT 'sch.content_generation','Content generation','Runs after SEO validation succeeds.','0 8 * * 1','workflow', id FROM public.workflows WHERE key='wf.content_generation';
INSERT INTO public.schedules (key, name, description, cron, target_kind, target_id)
SELECT 'sch.publish','Publish','Runs after content is approved.','0 10 * * 1','workflow', id FROM public.workflows WHERE key='wf.publish';

INSERT INTO public.schedule_dependencies (schedule_id, depends_on_schedule_id, condition)
SELECT s.id, d.id, 'on_success' FROM public.schedules s, public.schedules d WHERE s.key='sch.seo_validation' AND d.key='sch.research_refresh';
INSERT INTO public.schedule_dependencies (schedule_id, depends_on_schedule_id, condition)
SELECT s.id, d.id, 'on_success' FROM public.schedules s, public.schedules d WHERE s.key='sch.content_generation' AND d.key='sch.seo_validation';
INSERT INTO public.schedule_dependencies (schedule_id, depends_on_schedule_id, condition)
SELECT s.id, d.id, 'on_success' FROM public.schedules s, public.schedules d WHERE s.key='sch.publish' AND d.key='sch.content_generation';

INSERT INTO public.recommendations (title, description, source_module, business_impact, revenue_impact, traffic_impact, time_saved_minutes, risk, confidence, reasoning, suggested_action, state) VALUES
 ('Connect the GitHub capability','The repository capability is registered but not authorised, so publish workflows cannot complete.','capabilities','high','low','none',120,'low',0.90,'Publish depends on repository write access. Without it the final workflow node fails every run.','{"action":"authorise_capability","capability":"cap.github"}'::jsonb,'proposed'),
 ('Enable the research capability','Web research is pending credentials, blocking the weekly refresh chain.','capabilities','high','medium','medium',240,'low',0.85,'The research refresh workflow is the upstream dependency for three downstream schedules.','{"action":"authorise_capability","capability":"cap.web_research"}'::jsonb,'proposed'),
 ('Index the brand system into knowledge','Design system entries exist but are not embedded for retrieval.','knowledge','medium','none','none',60,'low',0.70,'Agents currently answer brand questions without retrieval grounding.','{"action":"index_collection","collection":"kb.design_systems"}'::jsonb,'draft');

INSERT INTO public.inbox_items (lane, source_module, title, summary, priority, subject_kind, subject_id)
SELECT 'pending_approval','recommendations', r.title, r.description, 1, 'recommendation', r.id
FROM public.recommendations r WHERE r.state = 'proposed';

INSERT INTO public.inbox_items (lane, source_module, title, summary, priority, subject_kind, subject_id)
SELECT 'scheduled','scheduler','Weekly research chain queued','Research refresh leads a four-step dependency chain ending in publish.',3,'schedule', id
FROM public.schedules WHERE key='sch.research_refresh';

INSERT INTO public.inbox_items (lane, source_module, title, summary, priority, subject_kind, subject_id)
SELECT 'needs_attention','capabilities','Capability not authorised','GitHub is registered but has no credentials, so publish cannot run.',1,'capability', id
FROM public.capabilities WHERE key='cap.github';

INSERT INTO public.inbox_items (lane, source_module, title, summary, priority)
VALUES ('fyi','platform','Operating system initialised','Registries, workflows, schedules, and knowledge collections are live.',4);

INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, summary) VALUES
 ('system','platform','initialised','platform','Operating system schema and registries created.'),
 ('system','registry','registered','capability','Eight capabilities registered across connector, service, model, and module kinds.'),
 ('system','scheduler','linked','schedule','Four schedules linked into a dependency chain.');
