CREATE TYPE public.roadmap_status AS ENUM ('requested','in_progress','shipped','parked');
CREATE TYPE public.roadmap_priority AS ENUM ('now','next','later');

CREATE TABLE public.roadmap_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status public.roadmap_status NOT NULL DEFAULT 'requested',
  priority public.roadmap_priority NOT NULL DEFAULT 'next',
  linked_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  shipped_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX roadmap_items_tenant_status_idx ON public.roadmap_items (tenant_id, status, sort_order);

CREATE TABLE public.roadmap_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  author_id UUID,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX roadmap_comments_item_idx ON public.roadmap_comments (item_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_items TO authenticated;
GRANT ALL ON public.roadmap_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_comments TO authenticated;
GRANT ALL ON public.roadmap_comments TO service_role;

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage roadmap items" ON public.roadmap_items
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members manage roadmap comments" ON public.roadmap_comments
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TRIGGER update_roadmap_items_updated_at BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();