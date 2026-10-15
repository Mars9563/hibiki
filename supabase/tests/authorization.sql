-- Authorization regression tests for the Hibiki database.
--
-- Run with:  supabase/scripts/run-authz-tests.sh   (see supabase/README.md)
--
-- SAFE ON PRODUCTION: everything below runs inside ONE transaction that always ends in
-- ROLLBACK. The three fake users, rooms and messages never persist. Roles are impersonated the
-- way PostgREST does it: SET LOCAL ROLE <anon|authenticated|service_role> plus the
-- request.jwt.claims setting that auth.uid() reads.
--
-- How to read the output:
--   * Sections A and B are ABUSE attempts. Each must END IN AN ERROR. A line containing
--     "EXECUTED ->", "INSERTED", "UPDATED" or "SIGN-UP ACCEPTED" there means a hole is open.
--     (B6-B9 are controls that must also be denied / return nothing.)
--   * Section C prints the privilege snapshot (what anon/authenticated can execute/touch).
--   * Section D are LEGITIMATE backend flows. Every one must succeed and print a "D<n> ..." line;
--     the runner checks that the expected number of them appear.

BEGIN;
-- Authorization test harness. EVERYTHING runs inside one transaction that is rolled back at the end.
-- Fake users/rooms exist only inside it. Roles are impersonated like PostgREST does:
--   SET LOCAL ROLE <anon|authenticated|service_role>  +  request.jwt.claims (read by auth.uid()).
\set ON_ERROR_STOP off
\pset pager off
\pset tuples_only on
\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

-- ---------- fixtures (as supabase_admin) ----------
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  (:'ua', 'authenticated','authenticated','alice@test.invalid','{"username":"t_alice","full_name":"Alice"}'),
  (:'ub', 'authenticated','authenticated','bob@test.invalid',  '{"username":"t_bob","full_name":"Bob"}'),
  (:'uc', 'authenticated','authenticated','carol@test.invalid','{"username":"t_carol","full_name":"Carol"}');
select 'fixture: profiles created by trigger = ' || count(*) from public.profiles where id in (:'ua',:'ub',:'uc');
-- pending friendship alice -> carol  (bob is an unrelated third party)
insert into public.friendships (requester_id, addressee_id) values (:'ua', :'uc');
-- private group G, admin = alice
select id as gid from public.create_group_with_creator(:'ua', 'private-group-G') \gset
-- a second private group H, admin = carol
select id as hid from public.create_group_with_creator(:'uc', 'private-group-H') \gset
-- alice legitimately invites bob to G (bob = invitee of a real invite)
insert into public.group_invites (room_id, inviter_id, invitee_id) values (:'gid', :'ua', :'ub');

\echo
\echo '################ A. RPC EXECUTION  (expect: DENIED for anon/authenticated)'
\echo '--- A1 anon  -> accept_friendship(alice,carol)'
SAVEPOINT s; set local role anon;
select 'EXECUTED -> room ' || id from public.accept_friendship(:'ua', :'uc');
ROLLBACK TO s;
\echo '--- A2 bob (authenticated, unrelated) -> accept_friendship(alice,carol): accept someone else''s friendship'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
select 'EXECUTED -> room ' || id from public.accept_friendship(:'ua', :'uc');
ROLLBACK TO s;
\echo '--- A3 bob -> create_group_with_creator(carol,...): create a group as someone else'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
select 'EXECUTED -> room ' || id || ', admin=carol' from public.create_group_with_creator(:'uc', 'forged-by-bob');
ROLLBACK TO s;
\echo '--- A4 bob (NOT a member of G) -> create_message_with_attachments(sender=alice, room=G): spoof sender'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
select 'EXECUTED -> message sender=' || (r->'message'->>'sender_id') from public.create_message_with_attachments(:'ua', :'gid', 'forged message', 'text', '[]'::jsonb) r;
ROLLBACK TO s;

\echo
\echo '################ B. DIRECT TABLE ABUSE via PostgREST-equivalent access (bob is authenticated)'
\echo '--- B1 bob inserts an invite for HIMSELF into group H (bob is not a member/admin of H)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
insert into public.group_invites (room_id, inviter_id, invitee_id) values (:'hid', :'ub', :'ub') returning 'INSERTED invite into H, status=' || status;
ROLLBACK TO s;
\echo '--- B2 bob (invitee of a real invite to G) rewrites that invite''s room_id to H'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
update public.group_invites set room_id = :'hid' where invitee_id = :'ub' returning 'UPDATED invite now points at room H: ' || (room_id = :'hid'::uuid);
ROLLBACK TO s;
\echo '--- B3 bob inserts an ALREADY-ACCEPTED friendship with carol (no consent)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
insert into public.friendships (requester_id, addressee_id, status) values (:'ub', :'uc', 'accepted') returning 'INSERTED friendship status=' || status;
ROLLBACK TO s;
\echo '--- B4 carol (addressee) rewrites requester_id of alice''s request to bob (forge a request from bob)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'uc','role','authenticated')::text, true);
update public.friendships set requester_id = :'ub' where addressee_id = :'uc' returning 'UPDATED requester_id is now bob: ' || (requester_id = :'ub'::uuid);
ROLLBACK TO s;
\echo '--- B5 alice (member) inserts a 70000-char message + an "image" message with no attachment, directly'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
insert into public.messages (sender_id, room_id, content) values (:'ua', :'gid', repeat('x', 70000)) returning 'INSERTED message length=' || length(content);
insert into public.messages (sender_id, room_id, content, message_type) values (:'ua', :'gid', null, 'image') returning 'INSERTED empty image-type message';
ROLLBACK TO s;
\echo '--- B6 bob spoofs sender_id=alice directly in messages (expect DENIED by RLS)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
insert into public.messages (sender_id, room_id, content) values (:'ua', :'gid', 'spoof') returning 'INSERTED (BAD)';
ROLLBACK TO s;
\echo '--- B7 bob (outsider) reads G messages / participants (expect 0 rows)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
select 'rows visible to bob in messages=' || (select count(*) from public.messages where room_id=:'gid') || ', participants of G=' || (select count(*) from public.chat_room_participants where room_id=:'gid');
ROLLBACK TO s;
\echo '--- B8 bob inserts himself as participant of G, and updates G''s name (expect DENIED)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
insert into public.chat_room_participants (room_id,user_id,role) values (:'gid', :'ub', 'admin') returning 'INSERTED (BAD)';
ROLLBACK TO s;
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
update public.chat_rooms set name='pwned' where id=:'gid' returning 'UPDATED (BAD)';
select 'chat_rooms rows updated for bob: 0 expected';
ROLLBACK TO s;
\echo '--- B9 anon: write attempts and reads (expect only profiles SELECT to work)'
SAVEPOINT s; set local role anon;
select 'anon can read profiles: ' || count(*) from public.profiles;
ROLLBACK TO s;
SAVEPOINT s; set local role anon; select count(*) from public.messages; ROLLBACK TO s;
SAVEPOINT s; set local role anon; insert into public.profiles (id, username) values (gen_random_uuid(), 'anon_made') returning 'INSERTED (BAD)'; ROLLBACK TO s;


\echo '--- B10 alice points her avatar at BOB''s Cloudinary asset (arbitrary public_id)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
update public.profiles set avatar_public_id = 'avatars/' || :'ub' where id = :'ua' returning 'UPDATED avatar -> ' || avatar_public_id;
ROLLBACK TO s;
\echo '--- B11 alice sets username to an invalid value directly (spaces/emoji/too long) and a 300-char name'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
update public.profiles set username = 'bad name!!' where id = :'ua' returning 'UPDATED username -> ' || username;
ROLLBACK TO s;
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
update public.profiles set full_name = repeat('n',300) where id = :'ua' returning 'UPDATED full_name length ' || length(full_name);
ROLLBACK TO s;
\echo '--- B12 direct sign-up with an invalid username via the auth trigger (what GoTrue does)'
SAVEPOINT s; set local role supabase_auth_admin;
insert into auth.users (id, aud, role, email, raw_user_meta_data) values (gen_random_uuid(),'authenticated','authenticated','evil@test.invalid','{"username":"bad name!!","full_name":"E"}') returning 'SIGN-UP ACCEPTED with invalid username';
ROLLBACK TO s;

\echo
\echo '################ C. PRIVILEGE SNAPSHOT'
select 'func ' || p.proname || ': anon=' || has_function_privilege('anon',p.oid,'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated',p.oid,'EXECUTE') || ' service_role=' || has_function_privilege('service_role',p.oid,'EXECUTE') || ' search_path=' || coalesce(array_to_string(p.proconfig,','),'-')
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('accept_friendship','create_group_with_creator','create_message_with_attachments','handle_new_user','is_room_participant','set_updated_at') order by p.proname;
select 'table ' || c.relname || ': anon=' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee='anon'),'-')
 || ' | authenticated=' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee='authenticated'),'-')
from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname;

\echo
\echo '################ D. LEGITIMATE BACKEND FLOWS  (expect: all succeed, before AND after)'
\echo '--- D1 service_role: accept_friendship(alice,carol) -> room + 2 participants + friendship accepted'
SAVEPOINT s; set local role service_role;
select id as rid from public.accept_friendship(:'ua', :'uc') \gset
select 'D1 room created, type=' || type from public.chat_rooms where id = :'rid' ;
select 'D1 participants=' || count(*) from public.chat_room_participants where room_id = :'rid';
select 'D1 friendship=' || status from public.friendships where requester_id=:'ua' and addressee_id=:'uc';
ROLLBACK TO s;
\echo '--- D2 service_role: create_group_with_creator(bob) -> bob is admin'
SAVEPOINT s; set local role service_role;
select id as nid from public.create_group_with_creator(:'ub','legit group') \gset
select 'D2 creator role=' || role from public.chat_room_participants where room_id=:'nid' and user_id=:'ub';
ROLLBACK TO s;
\echo '--- D3 service_role: create_message_with_attachments(alice, G, image+1 attachment)'
SAVEPOINT s; set local role service_role;
select 'D3 message_type=' || (r->'message'->>'message_type') || ' attachments=' || jsonb_array_length(r->'attachments')
from public.create_message_with_attachments(:'ua', :'gid', 'cap', 'image',
  format('[{"id":"%s","object_key":"attachments/k1","file_name":"a.png","mime_type":"image/png","file_size":10,"attachment_type":"image"}]', gen_random_uuid())::jsonb) r;
ROLLBACK TO s;
\echo '--- D4 alice (member): socket path = insert plain text message; read history page (order/limit/lt)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
with m as (insert into public.messages (sender_id, room_id, content) values (:'ua', :'gid', 'hello') returning 1)
select 'D4 inserted=' || count(*) from m;
select 'D4 history rows=' || count(*) from (select * from public.messages where room_id=:'gid' order by created_at desc limit 50) q;
ROLLBACK TO s;
\echo '--- D5 alice (admin of G): invite carol (inviteToGroup / createGroup path); admin sees own invite'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
with i as (insert into public.group_invites (room_id, inviter_id, invitee_id, status) values (:'gid', :'ua', :'uc', 'pending') returning 1)
select 'D5 invite inserted=' || count(*) from i;
ROLLBACK TO s;
\echo '--- D6 bob (invitee): accept invite = update status only; then service_role adds participant + a second invite is rejected via service-role delete'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ub','role','authenticated')::text, true);
with u as (update public.group_invites set status='accepted' where invitee_id=:'ub' and status='pending' returning 1)
select 'D6 invite accepted rows=' || count(*) from u;
reset role; set local role service_role;
with p as (insert into public.chat_room_participants (room_id,user_id,role) values (:'gid',:'ub','member') on conflict (room_id,user_id) do nothing returning 1)
select 'D6 participant upsert rows=' || count(*) from p;
with d as (delete from public.group_invites where invitee_id=:'ub' returning 1) select 'D6 service-role invite delete rows=' || count(*) from d;
ROLLBACK TO s;
\echo '--- D7 friend request: alice inserts pending to bob; carol (addressee of alice''s request) rejects = delete'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
with i as (insert into public.friendships (requester_id, addressee_id, status) values (:'ua', :'ub', 'pending') returning 1) select 'D7 request inserted=' || count(*) from i;
select set_config('request.jwt.claims', json_build_object('sub',:'uc','role','authenticated')::text, true);
with d as (delete from public.friendships where requester_id=:'ua' and addressee_id=:'uc' and status='pending' returning 1) select 'D7 addressee reject rows=' || count(*) from d;
ROLLBACK TO s;
\echo '--- D8 alice updates OWN profile (name/username/status/avatar at avatars/<id>); cannot touch others'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
with u as (update public.profiles set full_name='Alice A', username='alice_new', status='hi', avatar_public_id='avatars/'||:'ua', avatar_version='123' where id=:'ua' returning 1) select 'D8 own profile rows=' || count(*) from u;
with u as (update public.profiles set status='x' where id=:'ub' returning 1) select 'D8 other profile rows=' || count(*) || ' (0 expected)' from u;
ROLLBACK TO s;
\echo '--- D9 reads used by the app: user search (ilike), pending friendships, rooms, participants, attachments table'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
select 'D9 search hits=' || count(*) from (select id from public.profiles where username ilike '%t_b%' limit 10) q;
select 'D9 friendships visible=' || count(*) from public.friendships where requester_id=:'ua' or addressee_id=:'ua';
select 'D9 rooms visible=' || count(*) from public.chat_rooms;
select 'D9 participants visible=' || count(*) from public.chat_room_participants;
select 'D9 attachments select ok rows=' || count(*) from public.message_attachments;
ROLLBACK TO s;
\echo '--- D10 service_role group admin writes: update chat_rooms (fires updated_at trigger), change role'
SAVEPOINT s; set local role service_role;
with u as (update public.chat_rooms set name='renamed', description='d', avatar_public_id='groups/'||:'gid', avatar_version='1' where id=:'gid' returning 1) select 'D10 room updated rows=' || count(*) from u;
with u as (update public.chat_room_participants set role='admin' where room_id=:'gid' and user_id=:'ua' returning 1) select 'D10 role update rows=' || count(*) from u;
ROLLBACK TO s;
\echo '--- D11 sign-up as GoTrue does (supabase_auth_admin) with a VALID username -> trigger creates profile'
SAVEPOINT s; set local role supabase_auth_admin;
insert into auth.users (id, aud, role, email, raw_user_meta_data) values ('44444444-4444-4444-8444-444444444444','authenticated','authenticated','dave@test.invalid','{"username":"dave_ok","full_name":"Dave"}');
reset role; select 'D11 profile created=' || count(*) from public.profiles where id='44444444-4444-4444-8444-444444444444';
ROLLBACK TO s;
\echo '--- D12 anon: registration username-taken check reads profiles'
SAVEPOINT s; set local role anon; select 'D12 anon select profiles by username rows=' || count(*) from public.profiles where username = 't_alice'; ROLLBACK TO s;
\echo '--- D13 authenticated can still evaluate RLS helper (members see their room)'
SAVEPOINT s; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub',:'ua','role','authenticated')::text, true);
select 'D13 alice is_room_participant(G,alice)=' || public.is_room_participant(:'gid', :'ua'); ROLLBACK TO s;

ROLLBACK;
