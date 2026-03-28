-- ============================================================
-- NAPRAWY v7 – Rekurencyjne polityki RLS + nadanie admina
-- Zastosuj ten skrypt w konsoli SQL Supabase.
-- Naprawia: nieskończona rekurencja w chat_group_members SELECT,
--           brak polityki SELECT dla twórcy grupy,
--           niemożność tworzenia grup w TEBtalk
-- ============================================================


-- 1. FUNKCJE POMOCNICZE (SECURITY DEFINER – omijają RLS przy sprawdzaniu członkostwa)
--    Dzięki temu polityki nie wchodzą w nieskończoną rekurencję.

CREATE OR REPLACE FUNCTION public.is_chat_group_member(gid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_group_admin(gid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_group_members
    WHERE group_id = gid AND user_id = auth.uid() AND role = 'admin'
  );
$$;


-- 2. NAPRAWA POLITYK chat_groups
-- Twórca musi widzieć swoją grupę zaraz po CREATE (przed dodaniem siebie do chat_group_members).

DROP POLICY IF EXISTS "Widocznosc grup w ktorych sie jest" ON chat_groups;
DROP POLICY IF EXISTS "Tworca widzi swoja grupe" ON chat_groups;
DROP POLICY IF EXISTS "Tworzenie grup" ON chat_groups;

-- Twórca zawsze widzi swoje grupy; reszta widzi grupy, w których jest członkiem
CREATE POLICY "Widocznosc grup" ON chat_groups FOR SELECT USING (
    creator_id::uuid = auth.uid()::uuid
    OR public.is_chat_group_member(id)
);

-- INSERT: tylko twórca z własnym creator_id
CREATE POLICY "Tworzenie grup" ON chat_groups FOR INSERT WITH CHECK (
    auth.uid()::uuid = creator_id::uuid
);


-- 3. NAPRAWA POLITYK chat_group_members
-- Stare polityki powodowały nieskończoną rekurencję (self-referential SELECT).

DROP POLICY IF EXISTS "Odczyt czlonkow grupy" ON chat_group_members;
DROP POLICY IF EXISTS "Widocznosc czlonkow grup" ON chat_group_members;
DROP POLICY IF EXISTS "Tworca dodaje siebie jako admin" ON chat_group_members;
DROP POLICY IF EXISTS "Admin grupy dodaje czlonkow" ON chat_group_members;
DROP POLICY IF EXISTS "Zarzadzanie istniejacymi czlonkami" ON chat_group_members;
DROP POLICY IF EXISTS "Opuszczenie grupy" ON chat_group_members;

-- SELECT: każdy członek widzi listę członków swojej grupy (bez rekurencji – security definer)
CREATE POLICY "Odczyt czlonkow grupy" ON chat_group_members FOR SELECT USING (
    public.is_chat_group_member(group_id)
);

-- INSERT: twórca dodaje siebie jako admin (przed tym jak ktokolwiek jest w grupie)
CREATE POLICY "Tworca dodaje siebie jako admin" ON chat_group_members FOR INSERT WITH CHECK (
    (SELECT creator_id::uuid FROM chat_groups WHERE id::uuid = group_id::uuid) = auth.uid()::uuid
);

-- INSERT: admin grupy dodaje nowych członków
CREATE POLICY "Admin grupy dodaje czlonkow" ON chat_group_members FOR INSERT WITH CHECK (
    public.is_chat_group_admin(group_id)
);

-- UPDATE: admin grupy może zmieniać role
CREATE POLICY "Zarzadzanie istniejacymi czlonkami" ON chat_group_members FOR UPDATE USING (
    public.is_chat_group_admin(group_id)
);

-- DELETE: admin grupy lub sam użytkownik może opuścić
CREATE POLICY "Opuszczenie grupy" ON chat_group_members FOR DELETE USING (
    auth.uid()::uuid = user_id::uuid
    OR public.is_chat_group_admin(group_id)
);


-- 4. NAPRAWA POLITYK chat_group_messages
-- Stara polityka INSERT/SELECT odwoływała się do chat_group_members przez RLS → mogła powodować błędy.

DROP POLICY IF EXISTS "Czytanie wiadomosci grupowych" ON chat_group_messages;
DROP POLICY IF EXISTS "Pisanie wiadomosci grupowych" ON chat_group_messages;

CREATE POLICY "Czytanie wiadomosci grupowych" ON chat_group_messages FOR SELECT USING (
    public.is_chat_group_member(group_id)
);

CREATE POLICY "Pisanie wiadomosci grupowych" ON chat_group_messages FOR INSERT WITH CHECK (
    sender_id::uuid = auth.uid()::uuid
    AND public.is_chat_group_member(group_id)
    AND (SELECT is_banned FROM profiles WHERE id::uuid = auth.uid()::uuid) IS NOT TRUE
);


-- 5. NAPRAWA POLITYKI UPDATE chat_group_messages (soft-delete)
DROP POLICY IF EXISTS "Soft-delete wlasnych wiadomosci w grupie" ON chat_group_messages;
CREATE POLICY "Soft-delete wlasnych wiadomosci w grupie" ON chat_group_messages FOR UPDATE USING (
    sender_id::uuid = auth.uid()::uuid
    OR (SELECT role FROM profiles WHERE id::uuid = auth.uid()::uuid) IN ('admin', 'moderator_content', 'moderator_users')
);


-- 6. NAPRAWA POLITYKI DELETE rewear_posts (właściciel może soft-delete przez UPDATE status)
DROP POLICY IF EXISTS "Wlasciciel usuwa swoja oferte" ON rewear_posts;
CREATE POLICY "Wlasciciel usuwa swoja oferte" ON rewear_posts FOR UPDATE USING (
    seller_id::uuid = auth.uid()::uuid
    OR (SELECT role FROM profiles WHERE id::uuid = auth.uid()::uuid) IN ('admin', 'moderator_content')
);


-- 7. NADANIE ADMINA: Szymon Sosnowski (szymon.sosnowski2@teb.edu.pl)
UPDATE profiles
SET
    roles = (
        SELECT array_agg(DISTINCT r ORDER BY r)
        FROM unnest(COALESCE(roles, ARRAY['student']::text[]) || ARRAY['admin']::text[]) AS r
    ),
    role = 'admin'
WHERE email = 'szymon.sosnowski2@teb.edu.pl';
