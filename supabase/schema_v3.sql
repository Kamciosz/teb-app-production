-- INICJALIZACJA BAZY DANYCH SUPABASE DLA TEB-APP (POSTGRESQL v3.0) --
-- Zbudowane zgodnie ze standardami Feature-Driven i RBAC
-- Ten plik należy wkleić do konsoli SQL w panelu projektu Supabase --

-- 1. TABELA PROFILI Z NOWYMI ROLAMI (RBAC)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'student' CHECK (role IN (
        'student',                -- Zwykły Uczeń
        'tutor',                  -- Korepetytor (Wystawia usługi edukacyjne)
        'freelancer',             -- Freelancer (Wystawia usługi grafika/IT/itp)
        'editor',                 -- Redaktor (Tworzy Newsy SU na Feedzie)
        'moderator_content',      -- Młodszy Moderator (Czyści tablice i Re-Wear)
        'moderator_users',        -- Moderator Główny (Zarządza Kontami, Banuje)
        'admin'                   -- Pełny Administrator (Przewodniczący / IT)
    )), 
    teb_gabki INT DEFAULT 0, -- Waluta platformy: TEBGąbki
    is_banned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profile publiczne dla zalogowanych" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
-- Tylko Admin może edytować ręcznie inną osobę, ALE skrypty systemowe mogą zmieniać punkty
CREATE POLICY "Tylko Admin zienia innych" ON profiles FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' OR id = auth.uid()
);


-- 2. PORTAL INFORMACYJNY (FEED SU)
CREATE TABLE IF NOT EXISTS feed_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Formatowane przez edytor Rich Text HTML
    category TEXT DEFAULT 'news',
    image_url TEXT,
    upvotes INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wszyscy czytają tablice" ON feed_posts FOR SELECT USING (true);
-- Tylko Editor i Admin dodają wpis:
CREATE POLICY "Redaktorzy tworzą posty" ON feed_posts FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
);
-- Kasowanie: Autor, Młodszy Mod, Mod Użytkowników i Admin
CREATE POLICY "Obsługa kasowania tablicy" ON feed_posts FOR DELETE USING (
    auth.uid() = author_id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_content', 'moderator_users')
);


-- 3. GIEŁDA RE-WEAR (TOWARY I USŁUGI)
CREATE TABLE IF NOT EXISTS rewear_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price_teb_gabki INT DEFAULT 0, -- Cena w szkolnej walucie TEBGąbki
    item_type TEXT DEFAULT 'item' CHECK (item_type IN ('item', 'tutoring', 'service')),
    image_url TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE rewear_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wszyscy widzą aktywne aukcje" ON rewear_posts FOR SELECT USING (status = 'active');
-- Walidacja bezpieczeństwa podczas wstawiania:
CREATE POLICY "Kontrola wstawiania towarów" ON rewear_posts FOR INSERT WITH CHECK (
    auth.uid() = seller_id AND 
    (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false AND
    (
        item_type = 'item' OR -- Zwykły przedmiot sprzeda każdy
        (item_type = 'tutoring' AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('tutor', 'admin')) OR
        (item_type = 'service' AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('freelancer', 'admin'))
    )
);
-- Autor lub obsługa zdejmują aukcję
CREATE POLICY "Twórca modyfikuje aukcje" ON rewear_posts FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "Usuwanie ze sklepu" ON rewear_posts FOR DELETE USING (
    auth.uid() = seller_id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_content', 'moderator_users')
);

-- 4. SYSTEM ZGŁOSZEŃ (PRZYCISK "ZGŁOŚ")
CREATE TABLE IF NOT EXISTS reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Kto Zgłosił
    reported_entity_type TEXT NOT NULL CHECK (reported_entity_type IN ('feed_post', 'rewear_post', 'user_message', 'group')),
    reported_entity_id UUID NOT NULL, -- ID rzezy (posta/usera)
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- Zgłoszenie tworzy każdy zalogowany
CREATE POLICY "Uczeń ma prawo zglaszac" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
-- Odczyt zgłoszeń MA TYLKO załad Moderacji Kont
CREATE POLICY "Moderator Konta odczytuje tickety" ON reports FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_users')
);
CREATE POLICY "Oznaczanie jako rozwiazane" ON reports FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'moderator_users')
);

-- 5. WYZWALACZ: Inicjalizacja kont
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
      new.id, 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'full_name', new.email),
      'student'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- UWAGA: Jeżeli wyzwalacz on_auth_user_created już istnieje, zignoruj błąd.
