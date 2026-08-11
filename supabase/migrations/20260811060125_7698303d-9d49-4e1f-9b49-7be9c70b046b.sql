REVOKE ALL ON FUNCTION public.seed_tool_estate_on_tenant_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_tool_estate_on_tenant_insert() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_tool_estate_on_tenant_insert() TO service_role;