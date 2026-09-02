-- Code-defined agent rows are written by the service role only.
--
-- Backlog CODE-20. `agents` and `agent_capabilities` carried an ALL policy for
-- any operator (`is_operator()` for USING and WITH CHECK), so an operator in
-- any workspace could rewrite the global agent rows through PostgREST, while
-- the application exposes no such control: the only writer is the registry
-- sync, which upserts code-defined rows. The sync now runs as the service
-- role behind the operator check, so the operator-facing policy on these two
-- tables is the read one alone. `agent_knowledge` keeps its policy: it is
-- operator-authored by design.
-- Rollback: recreate both policies as
--   CREATE POLICY "operators manage agents" ON public.agents
--     FOR ALL TO authenticated USING (is_operator()) WITH CHECK (is_operator());
--   CREATE POLICY "operators manage agent_capabilities" ON public.agent_capabilities
--     FOR ALL TO authenticated USING (is_operator()) WITH CHECK (is_operator());
DROP POLICY IF EXISTS "operators manage agents" ON public.agents;
DROP POLICY IF EXISTS "operators manage agent_capabilities" ON public.agent_capabilities;
