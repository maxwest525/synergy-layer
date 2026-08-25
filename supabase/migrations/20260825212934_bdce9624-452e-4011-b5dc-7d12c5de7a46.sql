DROP POLICY IF EXISTS "read recommendation_dependencies" ON public.recommendation_dependencies;
CREATE POLICY "read recommendation_dependencies" ON public.recommendation_dependencies
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.recommendations r WHERE r.id = recommendation_dependencies.recommendation_id AND public.is_tenant_member(r.tenant_id)));
REVOKE SELECT ON public.recommendation_dependencies FROM anon;

DROP POLICY IF EXISTS "read recommendation_targets" ON public.recommendation_targets;
CREATE POLICY "read recommendation_targets" ON public.recommendation_targets
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.recommendations r WHERE r.id = recommendation_targets.recommendation_id AND public.is_tenant_member(r.tenant_id)));
REVOKE SELECT ON public.recommendation_targets FROM anon;

DROP POLICY IF EXISTS "read schedule_dependencies" ON public.schedule_dependencies;
CREATE POLICY "read schedule_dependencies" ON public.schedule_dependencies
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_dependencies.schedule_id AND public.is_tenant_member(s.tenant_id)));
REVOKE SELECT ON public.schedule_dependencies FROM anon;