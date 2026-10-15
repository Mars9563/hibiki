-- Restrict who may EXECUTE the functions in the public schema.
--
-- WHY: PostgREST exposes every function in `public` as /rest/v1/rpc/<name>, callable with
-- the (public) anon key. The three RPCs below are SECURITY DEFINER and owned by `postgres`
-- (BYPASSRLS), and take user ids as plain parameters. Because anon/authenticated could execute
-- them, anyone could accept a friendship between two other users, create a group "as" another
-- user, or post a message as another user. They are only ever meant to be called by the
-- backend, with the service-role key, after the backend has authenticated the caller.
--
-- ROLLBACK: supabase/rollbacks/20261015120000_restrict_function_privileges.down.sql

-- 1. Backend-only RPCs: service_role only. (Owners postgres/supabase_admin keep access.)
REVOKE ALL ON FUNCTION public.accept_friendship(uuid, uuid)                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_group_with_creator(uuid, text)                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_message_with_attachments(uuid, uuid, text, public.message_type, jsonb)
                                                                                                  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friendship(uuid, uuid)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.create_group_with_creator(uuid, text)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.create_message_with_attachments(uuid, uuid, text, public.message_type, jsonb)
                                                                                                  TO service_role;

-- 2. Trigger functions are invoked by the trigger machinery, never through the API.
--    (EXECUTE is only checked when a trigger is created, not each time it fires.)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at()  FROM PUBLIC, anon, authenticated;

-- 3. RLS helper: policies call it as the querying user, so `authenticated` must keep EXECUTE.
--    `anon` has no table access to the tables whose policies use it (see next migration).
REVOKE ALL ON FUNCTION public.is_room_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_participant(uuid, uuid) TO authenticated, service_role;

-- 4. SECURITY DEFINER hardening: put pg_temp LAST in search_path. Without it, pg_temp is
--    searched first for relations, letting a session shadow a table with a temp table.
ALTER FUNCTION public.accept_friendship(uuid, uuid)                                       SET search_path = public, pg_temp;
ALTER FUNCTION public.create_group_with_creator(uuid, text)                               SET search_path = public, pg_temp;
ALTER FUNCTION public.create_message_with_attachments(uuid, uuid, text, public.message_type, jsonb)
                                                                                          SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.is_room_participant(uuid, uuid)                                     SET search_path = public, pg_temp;

-- 5. Defense in depth for FUTURE functions: do not auto-grant EXECUTE to the API roles.
--    NOTE: PostgreSQL also grants EXECUTE to PUBLIC by default, so every new function in
--    `public` must still be followed by an explicit
--    `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` plus a targeted GRANT.
--    scripts/audit-grants.sql lists anything in `public` that the API roles can execute.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
