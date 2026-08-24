DROP POLICY IF EXISTS "read capabilities" ON public.capabilities;
CREATE POLICY "read capabilities" ON public.capabilities FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.capabilities FROM anon;

DROP POLICY IF EXISTS "read workflows" ON public.workflows;
CREATE POLICY "read workflows" ON public.workflows FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.workflows FROM anon;