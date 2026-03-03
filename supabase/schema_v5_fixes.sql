-- NAPRAWA BŁĘDÓW KRYTYCZNYCH (BETA-3.2 FIXES) --

-- 1. Brakujące kolumny w Re-Wear
ALTER TABLE rewear_posts ADD COLUMN IF NOT EXISTS price_pln NUMERIC DEFAULT 0;
ALTER TABLE rewear_posts ADD COLUMN IF NOT EXISTS price_teb_gabki NUMERIC DEFAULT 0;

-- 2. Naprawa RLS dla tworzenia grup (Błąd: Błąd integracji z systemem ról)
-- Umożliwiamy twórcy grupy dodanie samego siebie jako pierwszego członka
CREATE POLICY "Tworca dodaje siebie" ON chat_group_members FOR INSERT WITH CHECK (
    (SELECT creator_id FROM chat_groups WHERE id = group_id) = auth.uid()
);

-- 3. Poprawka dla zapytań wyszukiwania (opcjonalna, dla wydajności)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);
