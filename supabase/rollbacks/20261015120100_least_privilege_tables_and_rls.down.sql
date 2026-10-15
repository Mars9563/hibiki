-- Manual rollback for 20261015120100_least_privilege_tables_and_rls.sql.
-- Restores the previous (looser) grants and policies. Use only to recover from an outage you
-- have traced to this migration, then fix forward. Afterwards delete the row for version
-- 20261015120100 from supabase_migrations.schema_migrations so it can be re-applied.
BEGIN;

ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_avatar_is_own;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format,
  DROP CONSTRAINT IF EXISTS profiles_full_name_length,
  DROP CONSTRAINT IF EXISTS profiles_status_length,
  DROP CONSTRAINT IF EXISTS profiles_avatar_is_own;

DROP POLICY IF EXISTS "Users can send messages in rooms they belong to" ON public.messages;
CREATE POLICY "Users can send messages in rooms they belong to" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.chat_room_participants p WHERE p.room_id = messages.room_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Invitee can respond to a pending invite" ON public.group_invites;
CREATE POLICY "Invitee can update invite status" ON public.group_invites FOR UPDATE USING (invitee_id = auth.uid());
DROP POLICY IF EXISTS "Admins can send group invites" ON public.group_invites;
CREATE POLICY "Users can send group invites" ON public.group_invites FOR INSERT WITH CHECK (inviter_id = auth.uid());

DROP POLICY IF EXISTS "Users can create friend requests" ON public.friendships;
CREATE POLICY "Users can create friend requests" ON public.friendships FOR INSERT WITH CHECK (requester_id = auth.uid());
CREATE POLICY "Addressee can update friendship status" ON public.friendships FOR UPDATE USING (addressee_id = auth.uid());
CREATE POLICY "Enable delete for users based on user_id" ON public.friendships
  FOR DELETE USING (addressee_id = auth.uid() AND status = 'pending');

ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

COMMIT;
