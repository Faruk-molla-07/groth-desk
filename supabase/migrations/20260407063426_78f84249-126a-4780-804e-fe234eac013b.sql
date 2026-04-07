-- Revoke direct RPC access to is_community_member from client roles
-- The function will still work inside RLS policies (which run as SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) FROM anon, authenticated;