-- Least-privilege table grants + tighter RLS + DB-level invariants.
--
-- WHY: Supabase grants anon/authenticated ALL privileges (incl. TRUNCATE) on every table in
-- `public` and relies on RLS alone. Reviewing the live policies against what the backend
-- actually does showed gaps that any signed-in user could use by calling PostgREST directly
-- (bypassing the backend's checks and rate limits):
--   * group_invites INSERT did not require the inviter to be an admin of the room, so a user
--     could invite THEMSELVES into any group whose id they know and then accept via the API.
--   * group_invites UPDATE let an invitee rewrite ANY column (e.g. room_id) of their invite.
--   * friendships UPDATE let the addressee rewrite requester_id; friendships INSERT accepted
--     any status (e.g. 'accepted' with no consent).
--   * messages INSERT accepted >65 536 chars and non-text types with no attachments.
--   * profiles/chat_rooms could point avatar_public_id at someone else's Cloudinary asset.
--
-- WHAT THE BACKEND ACTUALLY DOES with the user-scoped (RLS) client — and therefore keeps:
--   messages: SELECT, INSERT(text)      friendships: SELECT, INSERT(pending), DELETE(by addressee)
--   group_invites: SELECT, INSERT(by room admin), UPDATE(status only, by invitee)
--   profiles: SELECT, UPDATE(own row)   chat_rooms / chat_room_participants /
--   message_attachments: SELECT only. Everything else uses the service role.
--
-- ROLLBACK: supabase/rollbacks/20261015120100_least_privilege_tables_and_rls.down.sql

-- ---------- 1. Table privileges ----------
-- anon only needs to read profiles (registration checks whether a username is taken).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.profiles TO anon;

-- authenticated: drop privileges RLS cannot meaningfully protect, then everything unused.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_rooms              FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_room_participants  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.message_attachments     FROM authenticated;
REVOKE UPDATE, DELETE         ON public.messages                FROM authenticated;
REVOKE INSERT, DELETE         ON public.profiles                FROM authenticated;
REVOKE UPDATE                 ON public.friendships             FROM authenticated;
REVOKE UPDATE, DELETE         ON public.group_invites           FROM authenticated;
-- an invitee may change ONLY the status of their invite (column-level privilege)
GRANT UPDATE (status) ON public.group_invites TO authenticated;

-- Future tables are not exposed to the API roles unless a migration grants them explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ---------- 2. RLS policies ----------
-- friendships: no UPDATE path for users (accepting goes through accept_friendship()).
DROP POLICY IF EXISTS "Addressee can update friendship status" ON public.friendships;
-- two identical DELETE policies existed; keep one.
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.friendships;

DROP POLICY IF EXISTS "Users can create friend requests" ON public.friendships;
CREATE POLICY "Users can create friend requests" ON public.friendships
  FOR INSERT WITH CHECK (requester_id = auth.uid() AND status = 'pending');

-- group_invites: only an admin of the room may invite, and never to themselves.
DROP POLICY IF EXISTS "Users can send group invites" ON public.group_invites;
CREATE POLICY "Admins can send group invites" ON public.group_invites
  FOR INSERT WITH CHECK (
    inviter_id = auth.uid()
    AND invitee_id <> inviter_id
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.chat_room_participants p
      WHERE p.room_id = group_invites.room_id
        AND p.user_id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Invitee can update invite status" ON public.group_invites;
CREATE POLICY "Invitee can respond to a pending invite" ON public.group_invites
  FOR UPDATE
  USING      (invitee_id = auth.uid() AND status = 'pending')
  WITH CHECK (invitee_id = auth.uid() AND status IN ('accepted', 'rejected'));

-- messages: direct inserts are plain text within the length cap (attachments are created
-- only by create_message_with_attachments(), which runs with the service role).
DROP POLICY IF EXISTS "Users can send messages in rooms they belong to" ON public.messages;
CREATE POLICY "Users can send messages in rooms they belong to" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND message_type = 'text'
    AND char_length(content) <= 65536
    AND EXISTS (
      SELECT 1 FROM public.chat_room_participants p
      WHERE p.room_id = messages.room_id AND p.user_id = auth.uid()
    )
  );

-- ---------- 3. Invariants the application already relies on, enforced in the DB ----------
-- (Existing rows were checked and satisfy all of these.)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[_a-zA-Z][a-zA-Z0-9._]{2,19}$'),
  ADD CONSTRAINT profiles_full_name_length CHECK (char_length(full_name) <= 255),
  ADD CONSTRAINT profiles_status_length CHECK (char_length(status) <= 150),
  -- the backend always stores avatars at avatars/<user id>; forbids pointing at other assets
  ADD CONSTRAINT profiles_avatar_is_own CHECK (avatar_public_id IS NULL OR avatar_public_id = 'avatars/' || id::text);

ALTER TABLE public.chat_rooms
  ADD CONSTRAINT chat_rooms_avatar_is_own CHECK (avatar_public_id IS NULL OR avatar_public_id = 'groups/' || id::text);
