-- This is an internal event-trigger handler. It must never be reachable via
-- the public PostgREST RPC surface.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
