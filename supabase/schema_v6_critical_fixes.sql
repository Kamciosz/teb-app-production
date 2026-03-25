-- ============================================================
-- KRYTYCZNE NAPRAWY BAZY DANYCH (BETA-3.2 → v6)
-- Zastosuj ten skrypt w konsoli SQL Supabase.
-- Naprawia: is_banned NULL, brakujące kolumny, polityki RLS
-- ============================================================

-- 1. BRAKUJĄCE KOLUMNY W TABELACH

-- Kolumna price_pln w rewear_posts (wymagana przez frontend)
ALTER TABLE rewear_posts ADD COLUMN IF NOT EXISTS price_pln NUMERIC DEFAULT 0;
ALTER TABLE rewear_posts ADD COLUMN IF NOT EXISTS price_teb_gabki NUMERIC DEFAULT 0;

-- Kolumna is_deleted w group_messages (soft-delete z poziomu UI)
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Kolumna banned_until w profiles (wymagana przez panel admina)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP WITH TIME ZONE;

-- Kolumna is_private w profiles (wymagana przez profil)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

-- Kolumna avatar_url w profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;


-- 2. NAPRAWA BŁĘDU NULL W PORÓWNANIU is_banned = false
-- PostgreSQL: NULL = false zwraca NULL (nie TRUE), co blokuje INSERT
-- Poprawka: użycie IS NOT TRUE zamiast = false

-- 2a. direct_messages
DROP POLICY IF EXISTS "Wysylanie wiadomosci wlasnych" ON direct_messages;
CREATE POLICY "Wysylanie wiadomosci wlasnych" ON direct_messages FOR INSERT WITH CHECK (
    auth.uid()::uuid = sender_id::uuid AND
    (SELECT is_banned FROM profiles WHERE id::uuid = auth.uid()::uuid) IS NOT TRUE
);

-- 2b. groups (kółka i grupy tematyczne)
DROP POLICY IF EXISTS "Zakladanie nowej grupy" ON groups;
CREATE POLICY "Zakladanie nowej grupy" ON groups FOR INSERT WITH CHECK (
    creator_id::uuid = auth.uid()::uuid AND
    (SELECT is_banned FROM profiles WHERE id::uuid = auth.uid()::uuid) IS NOT TRUE
);

-- 2c. group_members
DROP POLICY IF EXISTS "Zapisywanie sie do pustych grup" ON group_members;
CREATE POLICY "Zapisywanie sie do pustych grup" ON group_members FOR INSERT WITH CHECK (
    user_id::uuid = auth.uid()::uuid AND
    (SELECT is_banned FROM profiles WHERE id::uuid = auth.uid()::uuid) IS NOT TRUE
);

-- 2d. group_messages (dodaj też is_locked IS NOT TRUE zamiast = false)
DROP POLICY IF EXISTS "Pisanie na tablicy Grupy" ON group_messages;
CREATE POLICY "Pisanie na tablicy Grupy" ON group_messages FOR INSERT WITH CHECK (
    sender_id::uuid = auth.uid()::uuid AND
    (EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id::uuid = group_messages.group_id::uuid AND gm.user_id::uuid = auth.uid()::uuid)) AND
    (SELECT is_locked FROM groups WHERE id::uuid = group_messages.group_id::uuid) IS NOT TRUE AND
    (SELECT is_banned FROM profiles WHERE id::uuid = auth.uid()::uuid) IS NOT TRUE
);

-- 2e. rewear_posts – usuń restrykcję item_type (kategoria jest w JSON metadanych)
DROP POLICY IF EXISTS "Kontrola wstawiania towarów" ON rewear_posts;
CREATE POLICY "Kontrola wstawiania towarów" ON rewear_posts FOR INSERT WITH CHECK (
    auth.uid()::uuid = seller_id::uuid AND
    (SELECT is_banned FROM profiles WHERE id::uuid = auth.uid()::uuid) IS NOT TRUE
);


-- 3. NAPRAWA TWORZENIA GRUP PRYWATNYCH (TEBtalk)
-- Twórca musi móc dodać siebie jako pierwszego członka, zanim istnieje jakikolwiek admin grupy

-- Najpierw usuń starą politykę FOR ALL, która blokuje INSERT (dla nowej grupy nie ma jeszcze memberów)
DROP POLICY IF EXISTS "Zarzadzanie czlonkami" ON chat_group_members;
DROP POLICY IF EXISTS "Widocznosc czlonkow grup" ON chat_group_members;
DROP POLICY IF EXISTS "Odczyt czlonkow grupy" ON chat_group_members;
DROP POLICY IF EXISTS "Tworca dodaje siebie" ON chat_group_members;
DROP POLICY IF EXISTS "Tworca dodaje siebie jako admin" ON chat_group_members;
DROP POLICY IF EXISTS "Admin grupy dodaje czlonkow" ON chat_group_members;
DROP POLICY IF EXISTS "Zarzadzanie istniejacymi czlonkami" ON chat_group_members;
DROP POLICY IF EXISTS "Opuszczenie grupy" ON chat_group_members;

-- Dodaj granularniejsze polityki w miejsce jednej FOR ALL
CREATE POLICY "Odczyt czlonkow grupy" ON chat_group_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_group_members cgm WHERE cgm.group_id::uuid = chat_group_members.group_id::uuid AND cgm.user_id::uuid = auth.uid()::uuid)
);

-- Twórca grupy dodaje siebie jako admin (pierwsza rola, zanim ktokolwiek inny jest w grupie)
CREATE POLICY "Tworca dodaje siebie jako admin" ON chat_group_members FOR INSERT WITH CHECK (
    (SELECT creator_id::uuid FROM chat_groups WHERE id::uuid = group_id::uuid) = auth.uid()::uuid
);

-- Admin grupy może dodawać nowych członków
CREATE POLICY "Admin grupy dodaje czlonkow" ON chat_group_members FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_group_members cgm2 WHERE cgm2.group_id::uuid = group_id::uuid AND cgm2.user_id::uuid = auth.uid()::uuid AND cgm2.role = 'admin')
);

-- Admin grupy lub sam użytkownik może usunąć/zaktualizować
CREATE POLICY "Zarzadzanie istniejacymi czlonkami" ON chat_group_members FOR UPDATE USING (
    EXISTS (SELECT 1 FROM chat_group_members cgm3 WHERE cgm3.group_id::uuid = chat_group_members.group_id::uuid AND cgm3.user_id::uuid = auth.uid()::uuid AND cgm3.role = 'admin')
);
CREATE POLICY "Opuszczenie grupy" ON chat_group_members FOR DELETE USING (
    auth.uid()::uuid = user_id::uuid OR
    EXISTS (SELECT 1 FROM chat_group_members cgm4 WHERE cgm4.group_id::uuid = chat_group_members.group_id::uuid AND cgm4.user_id::uuid = auth.uid()::uuid AND cgm4.role = 'admin')
);


-- 4. MIĘKKIE USUWANIE WIADOMOŚCI GRUPOWYCH (is_deleted)
-- Brakująca polityka UPDATE dla group_messages (dla soft-delete)
DROP POLICY IF EXISTS "Soft-delete wlasnych wiadomosci" ON group_messages;
CREATE POLICY "Soft-delete wlasnych wiadomosci" ON group_messages FOR UPDATE USING (
    sender_id::uuid = auth.uid()::uuid OR
    (SELECT role FROM profiles WHERE id::uuid = auth.uid()::uuid) IN ('admin', 'moderator_content', 'moderator_users')
);


-- 5. NAPRAWA CONSTRAINTU TYPÓW ZGŁOSZEŃ (reports)
-- Dodaj brakujące typy: group_message, direct_message (używane przez ReportButton)
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_reported_entity_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_reported_entity_type_check CHECK (
    reported_entity_type IN (
        'feed_post',
        'rewear_post',
        'user_message',
        'direct_message',
        'group_message',
        'group'
    )
);
-- Dodaj kolumnę context dla kontekstu wiadomości zgłoszonej (używana przez ReportButton)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS context TEXT;


-- 6. AKTUALIZACJA DOMYŚLNYCH WARTOŚCI (naprawa NULL dla starych kont)
UPDATE profiles SET is_banned = false WHERE is_banned IS NULL;
UPDATE profiles SET is_private = false WHERE is_private IS NULL;
UPDATE groups SET is_locked = false WHERE is_locked IS NULL;
UPDATE groups SET is_approved = false WHERE is_approved IS NULL;
