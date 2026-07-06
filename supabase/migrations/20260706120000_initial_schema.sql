--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: attachment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attachment_type AS ENUM (
    'image',
    'video',
    'audio',
    'pdf',
    'other'
);


--
-- Name: friendship_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.friendship_type AS ENUM (
    'pending',
    'accepted',
    'rejected'
);


--
-- Name: message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_type AS ENUM (
    'text',
    'image',
    'video',
    'audio',
    'pdf',
    'other'
);


--
-- Name: participant_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.participant_role AS ENUM (
    'admin',
    'member'
);


--
-- Name: room_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.room_type AS ENUM (
    'direct',
    'group'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.room_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    direct_pair_hash text,
    name text,
    updated_at timestamp with time zone DEFAULT now(),
    avatar_public_id text,
    description text,
    avatar_version text,
    CONSTRAINT chat_rooms_description_only_for_groups CHECK (((type = 'group'::public.room_type) OR (description IS NULL))),
    CONSTRAINT chat_rooms_name_matches_type CHECK ((((type = 'group'::public.room_type) AND (name IS NOT NULL) AND (length(TRIM(BOTH FROM name)) > 0)) OR ((type = 'direct'::public.room_type) AND (name IS NULL))))
);


--
-- Name: accept_friendship(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_friendship(p_requester_id uuid, p_accepter_id uuid) RETURNS public.chat_rooms
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_friendship_id uuid;
  v_pair_hash text;
  v_room chat_rooms;
BEGIN
  -- Row-locks the friendship for the rest of this transaction, so two
  -- concurrent accept calls (or accept + reject racing) can't both win.
  SELECT id INTO v_friendship_id
  FROM friendships
  WHERE requester_id = p_requester_id
    AND addressee_id = p_accepter_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_friendship_id IS NULL THEN
    RAISE EXCEPTION 'No pending request found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE friendships
  SET status = 'accepted'
  WHERE id = v_friendship_id
    AND status = 'pending';

  -- Same pair-hash convention as the old JS: lexicographically-sorted
  -- ids joined with '_'. Spelled out explicitly rather than via a
  -- sort trick so it's obviously the same rule, not just hopefully so.
  v_pair_hash := CASE WHEN p_requester_id::text < p_accepter_id::text
    THEN p_requester_id::text || '_' || p_accepter_id::text
    ELSE p_accepter_id::text || '_' || p_requester_id::text
  END;

  -- Upsert-or-fetch in one statement — replaces the old "insert, catch
  -- 23505, refetch" dance entirely.
  INSERT INTO chat_rooms (type, direct_pair_hash)
  VALUES ('direct', v_pair_hash)
  ON CONFLICT (direct_pair_hash)
  DO UPDATE SET direct_pair_hash = EXCLUDED.direct_pair_hash
  RETURNING * INTO v_room;

  INSERT INTO chat_room_participants (room_id, user_id)
  VALUES (v_room.id, p_requester_id), (v_room.id, p_accepter_id)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN v_room;
END;
$$;


--
-- Name: create_group_with_creator(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_group_with_creator(p_creator_id uuid, p_name text) RETURNS public.chat_rooms
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_room chat_rooms;
BEGIN
  INSERT INTO chat_rooms (type, name)
  VALUES ('group', p_name)
  RETURNING * INTO v_room;

  INSERT INTO chat_room_participants (room_id, user_id, role)
  VALUES (v_room.id, p_creator_id, 'admin');

  RETURN v_room;
END;
$$;


--
-- Name: create_message_with_attachments(uuid, uuid, text, public.message_type, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_message_with_attachments(p_sender_id uuid, p_room_id uuid, p_content text, p_message_type public.message_type, p_attachments jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_message messages;
  v_item    jsonb;
  v_row     message_attachments;
  v_result  jsonb := '[]'::jsonb;
BEGIN
  -- RLS is bypassed here (SECURITY DEFINER) — membership must be
  -- checked explicitly. attachment.service.ts checks this too,
  -- before spending any R2 bandwidth; this is defense in depth.
  IF NOT public.is_room_participant(p_room_id, p_sender_id) THEN
    RAISE EXCEPTION 'Not a participant of this room' USING ERRCODE = 'P0005';
  END IF;

  IF p_message_type = 'text' AND (p_content IS NULL OR length(trim(p_content)) = 0) THEN
    RAISE EXCEPTION 'Text messages require content' USING ERRCODE = 'P0003';
  END IF;

  IF p_message_type != 'text' AND jsonb_array_length(p_attachments) = 0 THEN
    RAISE EXCEPTION 'Non-text messages require at least one attachment' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO messages (sender_id, room_id, content, message_type)
  VALUES (p_sender_id, p_room_id, p_content, p_message_type)
  RETURNING * INTO v_message;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_attachments)
  LOOP
    INSERT INTO message_attachments (
      id, message_id, room_id, object_key, file_name, mime_type, file_size, attachment_type
    )
    VALUES (
      (v_item->>'id')::uuid,
      v_message.id,
      p_room_id,
      v_item->>'object_key',
      v_item->>'file_name',
      v_item->>'mime_type',
      (v_item->>'file_size')::integer,
      (v_item->>'attachment_type')::attachment_type
    )
    RETURNING * INTO v_row;

    v_result := v_result || to_jsonb(v_row);
  END LOOP;

  RETURN jsonb_build_object('message', to_jsonb(v_message), 'attachments', v_result);
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$begin
  insert into public.profiles (
    id,
    username,
    full_name,
    avatar_public_id
  )
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    null
  );

  return new;
end;$$;


--
-- Name: is_room_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_room_participant(p_room_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.chat_room_participants
    where room_id = p_room_id
      and user_id = p_user_id
  );
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: chat_room_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_room_participants (
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    role public.participant_role DEFAULT 'member'::public.participant_role NOT NULL
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status public.friendship_type DEFAULT 'pending'::public.friendship_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT friendships_check CHECK ((requester_id <> addressee_id))
);


--
-- Name: group_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    inviter_id uuid NOT NULL,
    invitee_id uuid NOT NULL,
    status public.friendship_type DEFAULT 'pending'::public.friendship_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    room_id uuid NOT NULL,
    object_key text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    attachment_type public.attachment_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT message_attachments_file_size_check CHECK ((file_size > 0))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    room_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    content text,
    message_type public.message_type DEFAULT 'text'::public.message_type NOT NULL,
    CONSTRAINT messages_text_requires_content CHECK (((message_type <> 'text'::public.message_type) OR ((content IS NOT NULL) AND (length(TRIM(BOTH FROM content)) > 0))))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    full_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    avatar_public_id text,
    status text,
    avatar_version text
);


--
-- Name: chat_room_participants chat_room_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_participants
    ADD CONSTRAINT chat_room_participants_pkey PRIMARY KEY (room_id, user_id);


--
-- Name: chat_rooms chat_rooms_direct_pair_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_direct_pair_hash_key UNIQUE (direct_pair_hash);


--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_requester_id_addressee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_addressee_id_key UNIQUE (requester_id, addressee_id);


--
-- Name: group_invites group_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invites
    ADD CONSTRAINT group_invites_pkey PRIMARY KEY (id);


--
-- Name: group_invites group_invites_room_id_invitee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invites
    ADD CONSTRAINT group_invites_room_id_invitee_id_key UNIQUE (room_id, invitee_id);


--
-- Name: message_attachments message_attachments_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_object_key_key UNIQUE (object_key);


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: idx_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attachments_message ON public.message_attachments USING btree (message_id);


--
-- Name: idx_attachments_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attachments_room ON public.message_attachments USING btree (room_id);


--
-- Name: idx_friendships_addressee_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friendships_addressee_status ON public.friendships USING btree (addressee_id, status);


--
-- Name: idx_friendships_requester_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friendships_requester_status ON public.friendships USING btree (requester_id, status);


--
-- Name: idx_group_invites_invitee_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_invites_invitee_status ON public.group_invites USING btree (invitee_id, status);


--
-- Name: idx_messages_room_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_room_created_at ON public.messages USING btree (room_id, created_at DESC);


--
-- Name: idx_messages_room_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_room_type ON public.messages USING btree (room_id, message_type) WHERE (message_type <> 'text'::public.message_type);


--
-- Name: idx_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_user ON public.chat_room_participants USING btree (user_id);


--
-- Name: profiles_username_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_username_trgm_idx ON public.profiles USING gin (username public.gin_trgm_ops);


--
-- Name: chat_rooms trg_chat_rooms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chat_rooms_updated_at BEFORE UPDATE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: chat_room_participants chat_room_participants_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_participants
    ADD CONSTRAINT chat_room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: chat_room_participants chat_room_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_participants
    ADD CONSTRAINT chat_room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_invites group_invites_invitee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invites
    ADD CONSTRAINT group_invites_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_invites group_invites_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invites
    ADD CONSTRAINT group_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_invites group_invites_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invites
    ADD CONSTRAINT group_invites_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_attachments message_attachments_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: messages messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships Addressee can update friendship status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Addressee can update friendship status" ON public.friendships FOR UPDATE USING ((addressee_id = auth.uid()));


--
-- Name: chat_rooms Admins can update their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update their group" ON public.chat_rooms FOR UPDATE USING (((type = 'group'::public.room_type) AND (EXISTS ( SELECT 1
   FROM public.chat_room_participants p
  WHERE ((p.room_id = chat_rooms.id) AND (p.user_id = auth.uid()) AND (p.role = 'admin'::public.participant_role))))));


--
-- Name: friendships Enable delete for friendship request where they are the address; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for friendship request where they are the address" ON public.friendships FOR DELETE USING (((( SELECT auth.uid() AS uid) = addressee_id) AND (status = 'pending'::public.friendship_type)));


--
-- Name: friendships Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public.friendships FOR DELETE USING (((addressee_id = auth.uid()) AND (status = 'pending'::public.friendship_type)));


--
-- Name: group_invites Invitee can update invite status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invitee can update invite status" ON public.group_invites FOR UPDATE USING ((invitee_id = auth.uid()));


--
-- Name: message_attachments Participants can view room attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view room attachments" ON public.message_attachments FOR SELECT USING (public.is_room_participant(room_id, auth.uid()));


--
-- Name: friendships Users can create friend requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create friend requests" ON public.friendships FOR INSERT WITH CHECK ((requester_id = auth.uid()));


--
-- Name: group_invites Users can send group invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send group invites" ON public.group_invites FOR INSERT WITH CHECK ((inviter_id = auth.uid()));


--
-- Name: messages Users can send messages in rooms they belong to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages in rooms they belong to" ON public.messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.chat_room_participants p
  WHERE ((p.room_id = messages.room_id) AND (p.user_id = auth.uid()))))));


--
-- Name: profiles Users can update own profile (full_name, username, avatar_url); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile (full_name, username, avatar_url)" ON public.profiles FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: messages Users can view messages in their rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their rooms" ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_room_participants p
  WHERE ((p.room_id = messages.room_id) AND (p.user_id = auth.uid())))));


--
-- Name: chat_room_participants Users can view participants of their rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view participants of their rooms" ON public.chat_room_participants FOR SELECT USING (public.is_room_participant(room_id, auth.uid()));


--
-- Name: group_invites Users can view relevant invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant invites" ON public.group_invites FOR SELECT USING (((inviter_id = auth.uid()) OR (invitee_id = auth.uid())));


--
-- Name: chat_rooms Users can view rooms they belong to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view rooms they belong to" ON public.chat_rooms FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_room_participants p
  WHERE ((p.room_id = chat_rooms.id) AND (p.user_id = auth.uid())))));


--
-- Name: friendships Users can view their friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their friendships" ON public.friendships FOR SELECT USING (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));


--
-- Name: chat_room_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_room_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: group_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles username lookup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "username lookup" ON public.profiles FOR SELECT USING (true);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: TABLE chat_rooms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_rooms TO anon;
GRANT ALL ON TABLE public.chat_rooms TO authenticated;
GRANT ALL ON TABLE public.chat_rooms TO service_role;


--
-- Name: FUNCTION accept_friendship(p_requester_id uuid, p_accepter_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_friendship(p_requester_id uuid, p_accepter_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_friendship(p_requester_id uuid, p_accepter_id uuid) TO anon;
GRANT ALL ON FUNCTION public.accept_friendship(p_requester_id uuid, p_accepter_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_friendship(p_requester_id uuid, p_accepter_id uuid) TO service_role;


--
-- Name: FUNCTION create_group_with_creator(p_creator_id uuid, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_group_with_creator(p_creator_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_group_with_creator(p_creator_id uuid, p_name text) TO anon;
GRANT ALL ON FUNCTION public.create_group_with_creator(p_creator_id uuid, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_group_with_creator(p_creator_id uuid, p_name text) TO service_role;


--
-- Name: FUNCTION create_message_with_attachments(p_sender_id uuid, p_room_id uuid, p_content text, p_message_type public.message_type, p_attachments jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_message_with_attachments(p_sender_id uuid, p_room_id uuid, p_content text, p_message_type public.message_type, p_attachments jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_message_with_attachments(p_sender_id uuid, p_room_id uuid, p_content text, p_message_type public.message_type, p_attachments jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_message_with_attachments(p_sender_id uuid, p_room_id uuid, p_content text, p_message_type public.message_type, p_attachments jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_message_with_attachments(p_sender_id uuid, p_room_id uuid, p_content text, p_message_type public.message_type, p_attachments jsonb) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION is_room_participant(p_room_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_room_participant(p_room_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_room_participant(p_room_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_room_participant(p_room_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE chat_room_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_room_participants TO anon;
GRANT ALL ON TABLE public.chat_room_participants TO authenticated;
GRANT ALL ON TABLE public.chat_room_participants TO service_role;


--
-- Name: TABLE friendships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;


--
-- Name: TABLE group_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_invites TO anon;
GRANT ALL ON TABLE public.group_invites TO authenticated;
GRANT ALL ON TABLE public.group_invites TO service_role;


--
-- Name: TABLE message_attachments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_attachments TO anon;
GRANT ALL ON TABLE public.message_attachments TO authenticated;
GRANT ALL ON TABLE public.message_attachments TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


--
-- Name: on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--
-- Lives on auth.users (GoTrue-managed schema, not dumped with the rest of
-- `public`) but must ship with this migration since it's what wires new
-- signups to a profiles row via public.handle_new_user().
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: supabase_realtime; Type: PUBLICATION TABLES; Schema: -; Owner: -
--
-- Tables broadcast over Realtime. The publication itself is created by the
-- realtime container's own bootstrap, not by us — only membership is ours.
--

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles, public.friendships, public.chat_rooms, public.messages;
