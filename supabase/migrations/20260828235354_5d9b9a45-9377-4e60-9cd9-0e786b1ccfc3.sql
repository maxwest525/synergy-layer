-- 1. Anonymous execute on SECURITY DEFINER helper
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO authenticated, service_role;

-- 2. Operator-scoped reads
DROP POLICY IF EXISTS "signed in operators read agents" ON public.agents;
CREATE POLICY "operators read agents" ON public.agents FOR SELECT TO authenticated USING (public.is_operator());

DROP POLICY IF EXISTS "signed in operators read agent_capabilities" ON public.agent_capabilities;
CREATE POLICY "operators read agent_capabilities" ON public.agent_capabilities FOR SELECT TO authenticated USING (public.is_operator());

DROP POLICY IF EXISTS "signed in operators read agent_knowledge" ON public.agent_knowledge;
CREATE POLICY "operators read agent_knowledge" ON public.agent_knowledge FOR SELECT TO authenticated USING (public.is_operator());

DROP POLICY IF EXISTS "read capabilities" ON public.capabilities;
CREATE POLICY "operators read capabilities" ON public.capabilities FOR SELECT TO authenticated USING (public.is_operator());

DROP POLICY IF EXISTS "read workflows" ON public.workflows;
CREATE POLICY "operators read workflows" ON public.workflows FOR SELECT TO authenticated USING (public.is_operator());

DROP POLICY IF EXISTS "read capability_dependencies" ON public.capability_dependencies;
CREATE POLICY "operators read capability_dependencies" ON public.capability_dependencies FOR SELECT TO authenticated USING (public.is_operator());

-- 3. Roadmap write scoping
DROP POLICY IF EXISTS "Tenant members manage roadmap items" ON public.roadmap_items;
CREATE POLICY "Tenant members read roadmap items" ON public.roadmap_items FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members add roadmap items" ON public.roadmap_items FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND created_by = auth.uid());
CREATE POLICY "Authors or operators update roadmap items" ON public.roadmap_items FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id) AND (created_by = auth.uid() OR public.is_operator())) WITH CHECK (public.is_tenant_member(tenant_id) AND (created_by = auth.uid() OR public.is_operator()));
CREATE POLICY "Authors or operators delete roadmap items" ON public.roadmap_items FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id) AND (created_by = auth.uid() OR public.is_operator()));

DROP POLICY IF EXISTS "Tenant members manage roadmap comments" ON public.roadmap_comments;
CREATE POLICY "Tenant members read roadmap comments" ON public.roadmap_comments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members add roadmap comments" ON public.roadmap_comments FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND author_id = auth.uid());
CREATE POLICY "Authors or operators update roadmap comments" ON public.roadmap_comments FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id) AND (author_id = auth.uid() OR public.is_operator())) WITH CHECK (public.is_tenant_member(tenant_id) AND (author_id = auth.uid() OR public.is_operator()));
CREATE POLICY "Authors or operators delete roadmap comments" ON public.roadmap_comments FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id) AND (author_id = auth.uid() OR public.is_operator()));