-- Prevent direct RPC invocation of SECURITY DEFINER helpers (RLS still uses them)

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.user_owns_workspace(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.user_owns_workspace(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
