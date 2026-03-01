-- DODATEK BAZY DANYCH SUPABASE DLA TEB-APP (POSTGRESQL v4.0 - Social Modules) --
-- Ten plik należy wkleić do konsoli SQL żeby zainicjalizować TEBtalk i Grupy --

-- 1. BEZPOŚREDNIE WIADOMOŚCI P2P (TEBtalk)
CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
-- Zabezpieczenie: Odczyt tylko dla nadawcy stąd lub odbiorcy u celu
CREATE POLICY "Odczyt swoich wiadomosci" ON direct_messages FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
);
-- Zabezpieczenie: Pisanie tylko w swoim imieniu jako nadawca
CREATE POLICY "Wysylanie wiadomosci wlasnych" ON direct_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false
);


-- 2. KÓŁKA I GRUPY ZAINTERESOWAŃ
CREATE TABLE IF NOT EXISTS groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Inne',
    creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_approved BOOLEAN DEFAULT false, -- Typ: Czeka w kolejce u Administracji
    is_locked BOOLEAN DEFAULT false, -- Typ: Zablokowana przez Content Moderatora
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
-- Widoczność: Zaakceptowane dla wszystkich | Niezaakceptowane dla twórcy i Moderatorów Użytkowników/Zarządu
CREATE POLICY "Widocznosc Grup" ON groups FOR SELECT USING (
    is_approved = true OR 
    creator_id = auth.uid() OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_users', 'moderator_content')
);
-- Tworzenie: Każdy niezbanowany potrafi założyć (wędruje do weryfikacji)
CREATE POLICY "Zakladanie nowej grupy" ON groups FOR INSERT WITH CHECK (
    creator_id = auth.uid() AND (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false
);
-- Edycja (Akceptacja/Banowanie): Moderator Główny lub Młodszy Mod albo Admin
CREATE POLICY "Moderacja Grup" ON groups FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_users', 'moderator_content')
);


-- 3. CZŁONKOWIE GRUP
CREATE TABLE IF NOT EXISTS group_members (
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    PRIMARY KEY (group_id, user_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kazdy widzi kogo zrzesza grupa" ON group_members FOR SELECT USING (true);
CREATE POLICY "Zapisywanie sie do pustych grup" ON group_members FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false
);
CREATE POLICY "Wypisywanie sie" ON group_members FOR DELETE USING (
    user_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_users')
);


-- 4. CZAT W GRUPACH PUBLICZNYCH
CREATE TABLE IF NOT EXISTS group_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Czytanie czatu grup" ON group_messages FOR SELECT USING (true);
-- Tylko osoba bądąca zrzeszona grupie pisze (i tylko jeśli nie zablokowano czatu)
CREATE POLICY "Pisanie na tablicy Grupy" ON group_messages FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND 
    (EXISTS (SELECT 1 FROM group_members WHERE group_id = group_messages.group_id AND user_id = auth.uid())) AND
    (SELECT is_locked FROM groups WHERE id = group_messages.group_id) = false AND
    (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false
);
CREATE POLICY "Kasowanie spamu komunitakora" ON group_messages FOR DELETE USING (
    sender_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_content', 'moderator_users')
);
