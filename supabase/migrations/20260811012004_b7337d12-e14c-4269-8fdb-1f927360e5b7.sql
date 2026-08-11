-- is_tenant_member is a SECURITY DEFINER helper invoked from inside RLS
-- policies, all of which are scoped TO authenticated. A signed-out caller has
-- no legitimate reason to probe workspace membership, so the grant goes.
-- Note: authenticated must keep EXECUTE on this and on has_role/is_operator,
-- because the policies evaluate them as the calling user; revoking that would
-- deny every tenant-scoped read in the app.
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM anon;