-- capability_dependencies was the one table the anon-revoke sweep missed: the
-- bootstrap migration (20260804091534) granted anon SELECT with a USING (true)
-- policy on 18 tables, and later migrations closed 17. Same fix as its parent
-- table `capabilities` in 20260824195544.
DROP POLICY IF EXISTS "read capability_dependencies" ON public.capability_dependencies;
CREATE POLICY "read capability_dependencies" ON public.capability_dependencies FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.capability_dependencies FROM anon;
