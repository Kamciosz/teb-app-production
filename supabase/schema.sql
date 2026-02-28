-- INICJALIZACJA BAZY DANYCH SUPABASE DLA TEB-APP (POSTGRESQL) --
-- Ten plik należy wkleić do konsoli SQL w panelu projektu Supabase --

-- 1. TABELA PROFILI (Łączona z kontami O365 / Auth)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY, -- ID tożsame z kontem użytkownika
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'editor', 'admin')), -- RBAC
    points INT DEFAULT 0, -- Złote Punkty Tech-Teb
    is_banned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Zabezpieczenia RLS dla Profilu:
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Każdy zalogowany może czytać profile innych (do DM i Vinted)
CREATE POLICY "Profile są publiczne dla zalogowanych" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
-- Tylko Admin może edytować czyjeś punkty czy rolę! Sam uczeń nie może edytować własnego profilu.
CREATE POLICY "Tylko Admin edytuje profile" ON profiles FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);


-- 2. TABELA GŁÓWNA (Szkolny Feed)
CREATE TABLE feed_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT, -- Opcjonalne linki do Storage
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    is_draft BOOLEAN DEFAULT false, -- Dla nadzoru moderacji
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
-- Każdy uczeń może czytać tablicę
CREATE POLICY "Każdy czyta otwartą tablicę" ON feed_posts FOR SELECT USING (is_draft = false);
-- Tylko uczeń z rolą 'editor' lub 'admin' może dodać wpis
CREATE POLICY "Tylko redaktor pisze posty" ON feed_posts FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    AND (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false
);
-- Tylko autor posta (albo Admin) może go skasować
CREATE POLICY "Autor lub admin kasuje wpis" ON feed_posts FOR DELETE USING (
    auth.uid() = author_id OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);


-- 3. TABELA VINTED (Szkolny Ryneczek)
CREATE TABLE vinted_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE vinted_items ENABLE ROW LEVEL SECURITY;
-- Każdy widzi aktywne oferty
CREATE POLICY "Każdy widzi oferty" ON vinted_items FOR SELECT USING (status = 'active');
-- Każdy (nie zbanowany) uczeń może wystawić przedmiot
CREATE POLICY "Uczniowie wystawiają przedmioty" ON vinted_items FOR INSERT WITH CHECK (
    auth.uid() = seller_id AND (SELECT is_banned FROM profiles WHERE id = auth.uid()) = false
);
-- Tylko właściciel oferty oznacza ją jako 'sold' lub usuwa
CREATE POLICY "Właściciel edytuje ofertę" ON vinted_items FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "Właściciel usuwa ofertę" ON vinted_items FOR DELETE USING (auth.uid() = seller_id);


-- WYZWALACZ (TRIGGER): Tworzenie rekordu w PROFILES, gdy ktoś loguje się po raz pierwszy przez O365
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
      new.id, 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'full_name', new.email),
      'student' -- Domyślna ranga dla nowych
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
