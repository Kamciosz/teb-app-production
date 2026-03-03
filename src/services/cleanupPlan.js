/**
 * PROJEKT: Śmieciarka (Cleanup Service)
 * MIEJSCE: Supabase Edge Function (Cron Trigger)
 * CEL: Usuwanie nieużywanych obrazów z CDN i starych ticketów.
 *
 * IMPLEMENTACJA (Plan):
 * 1. Wyzwalacz: Co 24h (0 0 * * *)
 * 2. Akcja A: Pobierz wszystkie publiczne URL z tabeli `feed_posts`, `profiles`, `direct_messages`.
 * 3. Akcja B: Porównaj z listą plików w ImageKit (wymaga API Key ImageKit).
 * 4. Akcja C: Usuń pliki starsze niż 7 dni, które nie mają referencji w bazie.
 * 5. Akcja D: Usuń tickety (`reports`) starsze niż 30 dni oznaczone jako 'resolved'.
 */

// Przykładowy kod SQL do wyczyszczenia bazy (można uruchomić w SQL Editor):
/*
DELETE FROM reports
WHERE status IN ('resolved', 'dismissed')
AND created_at < NOW() - INTERVAL '30 days';
*/

// Przykładowy kod do "Wylogowania zbanowanych" (Middleware / App Level):
// Sprawdzamy `profiles.is_banned` oraz `profiles.banned_until`.
