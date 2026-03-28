-- ============================================================
-- INSTRUKCJA SQL DLA NOWEGO PROGRAMISTY (v8 - ReWear Contact)
-- Pliki v6 i v7 są już w bazie — ten plik zawiera tylko
-- opcjonalne optymalizacje i opis zmian frontendowych.
-- ============================================================

-- 1. OPCJONALNY INDEKS — przyspiesza wyszukiwanie ofert konkretnego sprzedawcy
--    (pomocne przy podglądzie produktu i przycisku "Napisz do sprzedawcy")
CREATE INDEX IF NOT EXISTS idx_rewear_posts_seller_id ON rewear_posts(seller_id);

-- 2. OPCJONALNY INDEKS — przyspiesza filtrowanie aktywnych ogłoszeń
CREATE INDEX IF NOT EXISTS idx_rewear_posts_status ON rewear_posts(status);


-- ============================================================
-- CO ZOSTAŁO NAPRAWIONE W FRONTENDZIE (bez zmian SQL):
-- ============================================================
-- a) TEBtalk — duplikacja wiadomości (wyświetlały się 2 razy):
--    Przyczyna: optimistic update + Supabase Realtime INSERT dochodziły
--    jednocześnie. Naprawiono przez deduplication przy zastępowaniu tempId.
--
-- b) ReWear — przycisk "Napisz do sprzedawcy":
--    W modalu szczegółów oferty dodano przycisk, który przenosi do TEBtalk
--    i automatycznie otwiera czat ze sprzedawcą.
--    Wymagane kolumny (już dostępne po v6): profiles.avatar_url, profiles.role
--
-- c) ReWear — błąd przy usuwaniu ogłoszenia:
--    handleDeleteItem używał status='inactive', który nie istnieje w CHECK constraint
--    tabeli rewear_posts. Naprawiono: zmieniono na status='archived'.
--    CHECK constraint z v3: CHECK (status IN ('active', 'sold', 'archived'))
--    Jeśli chcesz dodać 'inactive' jako dozwolony status, wykonaj:
--
--    ALTER TABLE rewear_posts
--        DROP CONSTRAINT IF EXISTS rewear_posts_status_check;
--    ALTER TABLE rewear_posts
--        ADD CONSTRAINT rewear_posts_status_check
--        CHECK (status IN ('active', 'sold', 'archived', 'inactive'));
--
-- ============================================================
-- PODSUMOWANIE TABEL UŻYWANYCH PRZEZ ReWear "Napisz do sprzedawcy":
-- ============================================================
--  rewear_posts    → seller_id (UUID), image_url, title, description,
--                    price_teb_gabki, price_pln, item_type, status
--  profiles        → id, full_name, avatar_url, role, is_banned
--  direct_messages → sender_id, receiver_id, content (używane przez TEBtalk)
--
-- Żadne nowe tabele nie są potrzebne do tego feature.
-- ============================================================
