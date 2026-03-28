-- ROZSZERZENIE BAZY DANYCH DLA TEB-APP (release-0.1 - Social & Multi-Rank) --

-- 1. ZNAJOMI
CREATE TABLE IF NOT EXISTS friends (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    PRIMARY KEY (user_id, friend_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Widocznosc swoich znajomych" ON friends FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Zapraszanie do znajomych" ON friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Akceptacja/Blokada znajomych" ON friends FOR UPDATE USING (auth.uid() = friend_id OR auth.uid() = user_id);

-- 2. CZATY GRUPOWE (PRYWATNE)
CREATE TABLE IF NOT EXISTS chat_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Widocznosc grup w ktorych sie jest" ON chat_groups FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = chat_groups.id AND user_id = auth.uid())
);
CREATE POLICY "Tworzenie grup" ON chat_groups FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- 3. CZŁONKOWIE CZATÓW GRUPOWYCH
CREATE TABLE IF NOT EXISTS chat_group_members (
    group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    nickname TEXT,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    PRIMARY KEY (group_id, user_id)
);

ALTER TABLE chat_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Widocznosc czlonkow grup" ON chat_group_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = chat_group_members.group_id AND user_id = auth.uid())
);
CREATE POLICY "Zarzadzanie czlonkami" ON chat_group_members FOR ALL USING (
    EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = chat_group_members.group_id AND user_id = auth.uid() AND role = 'admin')
    OR (auth.uid() = user_id AND (SELECT 1 FROM chat_group_members WHERE group_id = chat_group_members.group_id AND user_id = auth.uid()) IS NOT NULL)
);

-- 4. WIADOMOŚCI W CZATACH GRUPOWYCH
CREATE TABLE IF NOT EXISTS chat_group_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE chat_group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Czytanie wiadomosci grupowych" ON chat_group_messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = chat_group_messages.group_id AND user_id = auth.uid())
);
CREATE POLICY "Pisanie wiadomosci grupowych" ON chat_group_messages FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = chat_group_messages.group_id AND user_id = auth.uid())
);

-- 5. MULTI-RANK (RANGI)
-- Dodajemy kolumnę roles (ARRAY) do tabeli profiles dla wygody RLS i Reacta
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['student'];

-- Migracja starej roli do nowej tablicy
UPDATE profiles SET roles = ARRAY[role] WHERE roles IS NULL OR roles = '{}';

-- 6. POWIADOMIENIA PUSH (SUBSKRYPCJE)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    subscription_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tylko wlasne subskrypcje" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);
