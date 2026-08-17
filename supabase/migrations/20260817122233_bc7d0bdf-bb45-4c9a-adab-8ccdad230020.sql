DROP POLICY IF EXISTS "read agents" ON public.agents;
DROP POLICY IF EXISTS "read agent_capabilities" ON public.agent_capabilities;
DROP POLICY IF EXISTS "read agent_knowledge" ON public.agent_knowledge;

CREATE POLICY "signed in operators read agents" ON public.agents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed in operators read agent_capabilities" ON public.agent_capabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed in operators read agent_knowledge" ON public.agent_knowledge
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.agents FROM anon;
REVOKE SELECT ON public.agent_capabilities FROM anon;
REVOKE SELECT ON public.agent_knowledge FROM anon;