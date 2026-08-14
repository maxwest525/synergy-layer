DROP POLICY IF EXISTS "Tenant members manage keyword candidates" ON public.keyword_candidates;
DROP POLICY IF EXISTS "Tenant members manage tracked keywords" ON public.tracked_keywords;

CREATE POLICY "Operators manage keyword candidates"
  ON public.keyword_candidates FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

CREATE POLICY "Operators manage tracked keywords"
  ON public.tracked_keywords FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));