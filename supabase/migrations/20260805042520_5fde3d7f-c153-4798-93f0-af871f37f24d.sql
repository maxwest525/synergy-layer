CREATE OR REPLACE FUNCTION public.normalize_email(_email text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT lower(btrim(_email)) $$;

REVOKE ALL ON FUNCTION public.normalize_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_operator_from_allowlist(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_operator_from_allowlist(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.assert_admin_remains(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_admin_remains(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, supabase_auth_admin;

REVOKE ALL ON FUNCTION public.revoke_operator(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_operator(text) TO authenticated, service_role;