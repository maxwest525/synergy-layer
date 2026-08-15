CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stable_key text NOT NULL,
  title text NOT NULL,
  description text,
  source_type text NOT NULL CHECK (source_type IN ('playbook','execution_handbook','policy','research')),
  source_ref text NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stable_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.knowledge_source_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  content_text text NOT NULL,
  source_size_bytes bigint NOT NULL CHECK (source_size_bytes >= 0),
  parser_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','embedded','active','superseded','failed')),
  embedding_model text NOT NULL DEFAULT 'gemini-embedding-001',
  embedding_dimensions integer NOT NULL DEFAULT 768 CHECK (embedding_dimensions = 768),
  activated_at timestamptz,
  deactivated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id, content_sha256),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (source_id, tenant_id) REFERENCES public.knowledge_sources(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_version_id uuid NOT NULL REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  title text NOT NULL,
  heading_path text[] NOT NULL DEFAULT '{}',
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  token_estimate integer NOT NULL CHECK (token_estimate > 0),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  embedding extensions.vector(768) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_version_id, ordinal),
  UNIQUE (tenant_id, source_version_id, content_sha256),
  FOREIGN KEY (source_version_id, tenant_id)
    REFERENCES public.knowledge_source_versions(id, tenant_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_one_active_version
  ON public.knowledge_source_versions(tenant_id, source_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS knowledge_versions_source_created
  ON public.knowledge_source_versions(tenant_id, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_chunks_version_ordinal
  ON public.knowledge_chunks(tenant_id, source_version_id, ordinal);
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON public.knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS knowledge_chunks_lexical
  ON public.knowledge_chunks USING gin (to_tsvector('english', title || ' ' || body));

DROP TRIGGER IF EXISTS touch_knowledge_sources ON public.knowledge_sources;
CREATE TRIGGER touch_knowledge_sources BEFORE UPDATE ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS touch_knowledge_source_versions ON public.knowledge_source_versions;
CREATE TRIGGER touch_knowledge_source_versions BEFORE UPDATE ON public.knowledge_source_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.protect_knowledge_version_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.source_id, NEW.version_label, NEW.content_sha256,
    NEW.content_text, NEW.source_size_bytes, NEW.parser_version,
    NEW.embedding_model, NEW.embedding_dimensions, NEW.metadata
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.source_id, OLD.version_label, OLD.content_sha256,
    OLD.content_text, OLD.source_size_bytes, OLD.parser_version,
    OLD.embedding_model, OLD.embedding_dimensions, OLD.metadata
  ) THEN
    RAISE EXCEPTION 'Knowledge version content and provenance are immutable.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_knowledge_version_content ON public.knowledge_source_versions;
CREATE TRIGGER protect_knowledge_version_content
  BEFORE UPDATE ON public.knowledge_source_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_knowledge_version_content();

CREATE OR REPLACE FUNCTION public.protect_active_knowledge_chunks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  version_status text;
BEGIN
  SELECT status INTO version_status
  FROM public.knowledge_source_versions
  WHERE id = OLD.source_version_id;
  IF version_status IN ('embedded','active','superseded') THEN
    RAISE EXCEPTION 'Embedded knowledge chunks are immutable.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_active_knowledge_chunks ON public.knowledge_chunks;
CREATE TRIGGER protect_active_knowledge_chunks
  BEFORE UPDATE OR DELETE ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.protect_active_knowledge_chunks();

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_sources_read ON public.knowledge_sources;
CREATE POLICY knowledge_sources_read ON public.knowledge_sources
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS knowledge_versions_read ON public.knowledge_source_versions;
CREATE POLICY knowledge_versions_read ON public.knowledge_source_versions
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS knowledge_chunks_read ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_read ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

REVOKE ALL ON public.knowledge_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.knowledge_source_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.knowledge_chunks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.knowledge_sources TO authenticated;
GRANT SELECT ON public.knowledge_source_versions TO authenticated;
GRANT SELECT ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_sources TO service_role;
GRANT ALL ON public.knowledge_source_versions TO service_role;
GRANT ALL ON public.knowledge_chunks TO service_role;

CREATE OR REPLACE FUNCTION public.activate_knowledge_version(
  _tenant_id uuid,
  _version_id uuid
)
RETURNS public.knowledge_source_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.knowledge_source_versions;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND (NOT public.is_operator() OR NOT public.is_tenant_member(_tenant_id)) THEN
    RAISE EXCEPTION 'Operator access is required.';
  END IF;

  SELECT * INTO target
  FROM public.knowledge_source_versions
  WHERE id = _version_id AND tenant_id = _tenant_id
  FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Knowledge version not found.'; END IF;
  IF target.status NOT IN ('embedded','active') THEN
    RAISE EXCEPTION 'Only a fully embedded version can be activated.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_chunks
    WHERE source_version_id = target.id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'A knowledge version with no chunks cannot be activated.';
  END IF;

  UPDATE public.knowledge_source_versions
  SET status = 'superseded', deactivated_at = now()
  WHERE tenant_id = _tenant_id AND source_id = target.source_id
    AND status = 'active' AND id <> target.id;

  UPDATE public.knowledge_source_versions
  SET status = 'active', activated_at = COALESCE(activated_at, now()), deactivated_at = NULL
  WHERE id = target.id
  RETURNING * INTO target;
  RETURN target;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_knowledge_version(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_knowledge_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_knowledge_version(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  _tenant_id uuid,
  _query_embedding extensions.vector(768),
  _query_text text,
  _limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  source_version_id uuid,
  source_key text,
  source_title text,
  version_label text,
  title text,
  heading_path text[],
  body text,
  source_ref text,
  content_sha256 text,
  semantic_score double precision,
  lexical_score double precision,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH ranked AS (
    SELECT
      c.id,
      s.id AS source_id,
      c.source_version_id,
      s.stable_key AS source_key,
      s.title AS source_title,
      v.version_label,
      c.title,
      c.heading_path,
      c.body,
      s.source_ref,
      c.content_sha256,
      1 - (c.embedding <=> _query_embedding) AS semantic_score,
      ts_rank_cd(
        to_tsvector('english', c.title || ' ' || c.body),
        websearch_to_tsquery('english', _query_text)
      )::double precision AS lexical_score
    FROM public.knowledge_chunks c
    JOIN public.knowledge_source_versions v
      ON v.id = c.source_version_id AND v.tenant_id = c.tenant_id
    JOIN public.knowledge_sources s
      ON s.id = v.source_id AND s.tenant_id = v.tenant_id
    WHERE c.tenant_id = _tenant_id
      AND v.status = 'active'
      AND s.status = 'active'
      AND public.is_tenant_member(_tenant_id)
  )
  SELECT
    ranked.id,
    ranked.source_id,
    ranked.source_version_id,
    ranked.source_key,
    ranked.source_title,
    ranked.version_label,
    ranked.title,
    ranked.heading_path,
    ranked.body,
    ranked.source_ref,
    ranked.content_sha256,
    ranked.semantic_score,
    ranked.lexical_score,
    (ranked.semantic_score * 0.75 + LEAST(ranked.lexical_score, 1) * 0.25) AS score
  FROM ranked
  ORDER BY score DESC, source_key, title, id
  LIMIT LEAST(GREATEST(_limit, 1), 20);
$$;

REVOKE ALL ON FUNCTION public.match_knowledge_chunks(uuid, extensions.vector, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(uuid, extensions.vector, text, integer)
  TO authenticated, service_role;
