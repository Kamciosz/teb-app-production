/*
  PATCH HOTFIX - 4 moduły po wdrożeniu
  Zakres: profiles, rewear, tebtalk, groups
  Typy zmian: ALTER TABLE, CREATE POLICY, CREATE TRIGGER

  Cel:
  1) Przywrócić dostęp operacyjny dla authenticated
  2) Backfill profilu dla istniejących auth.users przez trigger update
  3) Dodać addytywne (nieinwazyjne) polityki RLS pod realny flow UI

  Uwaga:
  - Skrypt jest addytywny: nie usuwa istniejących polityk.
  - Nowe polityki mają unikalne nazwy *_fix_*.
*/

-- ==========================================================
-- 1) PROFILES
-- ==========================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Hotfix: authenticated może czytać profile (naprawa joinów w TebTalk/Groups/ReWear)
CREATE POLICY profiles_select_authenticated_fix_v1
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Hotfix: jawne self-write (gdyby stare polityki były niespójne)
CREATE POLICY profiles_update_self_fix_v1
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Hotfix: backfill profili dla istniejących userów na każdym update auth.users
-- (np. last_sign_in_at), używa istniejącej funkcji handle_auth_user_insert()
CREATE TRIGGER on_auth_user_backfill_fix_v1
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_insert();


-- ==========================================================
-- 2) REWEAR / OGLOSZENIA
-- ==========================================================

ALTER TABLE public.rewear_posts ENABLE ROW LEVEL SECURITY;

-- INSERT: właściciel musi być zalogowany i zgodny z auth.uid()
CREATE POLICY rewear_insert_owner_fix_v1
  ON public.rewear_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

-- UPDATE: właściciel może archiwizować/edytować swoje ogłoszenie
CREATE POLICY rewear_update_owner_fix_v1
  ON public.rewear_posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- DELETE: właściciel może usunąć swoje ogłoszenie
CREATE POLICY rewear_delete_owner_fix_v1
  ON public.rewear_posts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id);


-- ==========================================================
-- 3) TEBTALK
-- ==========================================================

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;

-- DIRECT MESSAGES
CREATE POLICY direct_messages_select_participants_fix_v1
  ON public.direct_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY direct_messages_insert_sender_fix_v1
  ON public.direct_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY direct_messages_update_sender_fix_v1
  ON public.direct_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY direct_messages_delete_sender_fix_v1
  ON public.direct_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

-- CHAT GROUPS
CREATE POLICY chat_groups_select_authenticated_fix_v1
  ON public.chat_groups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY chat_groups_insert_creator_fix_v1
  ON public.chat_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- CHAT GROUP MEMBERS
CREATE POLICY chat_group_members_select_self_or_member_fix_v1
  ON public.chat_group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_group_member(group_id));

CREATE POLICY chat_group_members_insert_self_fix_v1
  ON public.chat_group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_group_members_delete_self_fix_v1
  ON public.chat_group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- CHAT GROUP MESSAGES
CREATE POLICY chat_group_messages_select_member_fix_v1
  ON public.chat_group_messages
  FOR SELECT
  TO authenticated
  USING (public.is_chat_group_member(group_id));

CREATE POLICY chat_group_messages_insert_member_fix_v1
  ON public.chat_group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_chat_group_member(group_id));

CREATE POLICY chat_group_messages_update_sender_fix_v1
  ON public.chat_group_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY chat_group_messages_delete_sender_fix_v1
  ON public.chat_group_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);


-- ==========================================================
-- 4) KOLKA I GRUPY (LEGACY)
-- ==========================================================

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- GROUPS
CREATE POLICY groups_select_authenticated_fix_v1
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (is_approved = true OR creator_id = auth.uid());

CREATE POLICY groups_insert_creator_fix_v1
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY groups_update_creator_fix_v1
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- GROUP MEMBERS
CREATE POLICY group_members_select_self_or_member_fix_v1
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_group_member(group_id));

CREATE POLICY group_members_insert_self_fix_v1
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY group_members_delete_self_fix_v1
  ON public.group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- GROUP MESSAGES
CREATE POLICY group_messages_select_member_fix_v1
  ON public.group_messages
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY group_messages_insert_member_fix_v1
  ON public.group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_group_member(group_id));

CREATE POLICY group_messages_update_sender_fix_v1
  ON public.group_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY group_messages_delete_sender_fix_v1
  ON public.group_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);
