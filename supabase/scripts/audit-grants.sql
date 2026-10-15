-- Lists what the public API roles (anon, authenticated) can reach in the `public` schema.
-- Read-only. Run after every migration, e.g.:
--   ssh <host> "sudo docker exec -i <db-container> psql -U supabase_admin -d postgres" < supabase/scripts/audit-grants.sql
--
-- Expectation (anything else is worth a look):
--   1. Functions executable by anon:           none  (is_room_participant is authenticated-only)
--   2. Functions executable by authenticated:  only is_room_participant (used by RLS policies)
--   3. Tables without row level security:      none
--   4. anon table privileges:                  SELECT on profiles only

\echo '== 1. functions in public executable by anon (PUBLIC grants count: anon inherits them)'
SELECT p.oid::regprocedure AS function, p.prosecdef AS security_definer
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  -- ignore functions that belong to extensions (e.g. pg_trgm)
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
ORDER BY 1;

\echo '== 2. functions in public executable by authenticated'
SELECT p.oid::regprocedure AS function, p.prosecdef AS security_definer
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
ORDER BY 1;

\echo '== 3. SECURITY DEFINER functions without a pinned search_path (or without pg_temp last)'
SELECT p.oid::regprocedure AS function, p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%pg_temp')
ORDER BY 1;

\echo '== 4. tables in public WITHOUT row level security'
SELECT c.relname FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1;

\echo '== 5. table privileges held by anon / authenticated'
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 6. policies'
SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 3, 2;
