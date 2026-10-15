-- Manual rollback for 20261015120000_restrict_function_privileges.sql.
-- Restores the previous (INSECURE) state: the RPCs become callable by anon/authenticated again.
-- Only use this to recover from an outage you have traced to the migration, and re-apply a
-- fix promptly. Run on the database as supabase_admin, e.g. via scripts/deploy-migration.sh's
-- approach (ssh + docker exec ... psql -1). After running it, also delete the row for version
-- 20261015120000 from supabase_migrations.schema_migrations so the migration can be re-applied.
BEGIN;

GRANT EXECUTE ON FUNCTION public.accept_friendship(uuid, uuid)                                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_with_creator(uuid, text)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_message_with_attachments(uuid, uuid, text, public.message_type, jsonb)
                                                                                                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user(), public.set_updated_at()                       TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_participant(uuid, uuid)                                  TO PUBLIC, anon, authenticated;

ALTER FUNCTION public.accept_friendship(uuid, uuid)                                       SET search_path = public;
ALTER FUNCTION public.create_group_with_creator(uuid, text)                               SET search_path = public;
ALTER FUNCTION public.create_message_with_attachments(uuid, uuid, text, public.message_type, jsonb)
                                                                                          SET search_path = public;
ALTER FUNCTION public.handle_new_user()                                                   SET search_path = public;
ALTER FUNCTION public.is_room_participant(uuid, uuid)                                     SET search_path = public;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

COMMIT;
