# SWIEZY AUDYT — NOWE ZNALEZIONE PROBLEMY (May 2026)
## Nie powiela poprzednich audytów. Tylko NOWE znaleziska.

---

## 🔴 P1 — KRTYTYCZNE

### 1.1 Hardcodowany osobisty email administratora (PII leak)
**Plik:** `/api/auth/signup.js` linia 132  
**Kod:** `const adminEmail = 'kamciosz4you@gmail.com';`  
**Problem:** Prywatny adres email admina jest zakodowany na stałe w źródle (repo git). Każdy kto ma dostęp do repozytorium lub plików na Vercel widzi ten adres.  
**Ryzyko:** Wyciek PII administratora, spam, phishing. Jeśli ten email jest również używany do logowania (np. Supabase), to ujawnia połowę danych logowania.  
**Naprawa:** Przenieść do `process.env.ADMIN_NOTIFY_EMAIL`.

### 1.2 Hardcodowany fallback `noreply@teb-app.pl`
**Plik:** `/api/auth/signup.js` linie 112, 131  
**Kod:** `const fromEmail = process.env.SMTP_FROM || 'noreply@teb-app.pl';`  
**Problem:** Domena `teb-app.pl` może nie należeć do szkoły. Jeśli domena wygaśnie lub zostanie przejęta, attacker może wysyłać emaile podszywające się pod aplikację (np. phishingowe linki resetu hasła).  
**Ryzyko:** Jeśli domena wygaśnie i ktoś ją zarejestruje, może wysyłać emaile z `noreply@teb-app.pl`.  
**Naprawa:** Wymusić ustawienie `SMTP_FROM` w env (brak fallbacka).

---

## 🟠 P2 — WYSOKIE

### 2.1 Logowanie do Librusa przez zewnetrzny proxy — wyciek hasła
**Plik:** `/src/features/librus/Librus.jsx` linie 32-45  
**Kod:**  
```js
const body = { login, pass };
fetch('https://librus-proxy-production.up.railway.app/librus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});
```
**Problem:** Hasła uczniów do Librusa (System dziennika elektronicznego) są wysyłane w plaintext POST body do zewnętrznego serwisu na Railway (`librus-proxy-production.up.railway.app`). Kod w komentarzach (linia 81) przyznaje: "PROBLEM: Old proxy is DEAD (404)".  
**Ryzyko:**  
- Proxy jest martwe (404) — feature nie działa, pozostawia użytkownika z błędem  
- Gdyby proxy działało, hasła uczniów byłyby przesyłane przez zewnętrzną usługę której kod nie jest kontrolowany  
- CSP w `vercel.json` (linia 33) nadal pozwala na `connect-src` do tego martwego endpointu  
**Naprawa:** Usunąć martwy kod Librusa, usunąć domenę proxy z CSP `connect-src`.

### 2.2 Tworzenie dwoch polaczen SMTP na każda rejestrację
**Plik:** `/api/auth/signup.js` funkcje `sendConfirmationEmail()` i `sendAdminNotification()`  
**Problem:** Każda funkcja woła `createMailTransport()`, co tworzy nowe połączenie SMTP (handshake + auth). Dla 1000+ uczniów:  
- 1 rejestracja = 2 połączenia SMTP  
- Blok rejestracji (np. po lekcji) = dziesiątki połączeń na raz  
- Serwer SMTP może zacząć odrzucać połączenia (rate limiting po stronie providera)  
**Naprawa:** Utworzyć transport raz (modułowy singleton) i reużywać.

### 2.3 Odpowiedź API `send-email.js` zwraca pełny wynik providera do klienta
**Plik:** `/api/send-email.js` linia 204  
**Kod:** `return res.status(200).json({ ok: true, provider: 'brevo', result });`  
**Problem:** Pełna odpowiedź API Brevo/Resend (zawierająca `messageId`, `id`, potencjalnie status dostarczenia) jest wysyłana do przeglądarki. Klient admina nie potrzebuje tych danych — potencjalny wyciek metadata.  
**Ryzyko:** Niskie, ale niepotrzebne. Może ujawnić wewnętrzne ID transakcji providera.

---

## 🟡 P3 — ŚREDNIE

### 3.1 Brak detekcji kradzieży refresh tokena
**Plik:** `/lib/serverAuth.js` linie 218-226  
**Problem:** Jeśli refresh token zostanie skradziony, attacker może go używać wielokrotnie do odświeżania sesji. Supabase nie unieważnia starych refresh tokenów przy `refreshSession()`. Nie ma mechanizmu wykrywania "refresh token reuse".  
**Ryzyko:** Utrata sesji użytkownika po kradzieży tokena — brak możliwości wykrycia.  
**Naprawa:** Dodać weryfikację `token_revoked` w bazie i tracking w Supabase `gotrue`.

### 3.2 Brak timeoutu na stream `readJsonBody()`
**Plik:** `/lib/serverAuth.js` linie 109-120  
**Problem:** Pętla `for await (const chunk of req)` nie ma timeoutu. Jeśli klient wysyła bardzo wolny strumień (slow loris attack), Vercel Function będzie wisieć aż do 10s limitu Vercel.  
**Ryzyko:** Potencjalne wyczerpanie równoległych Vercel Function slots przy ataku slow loris.  
**Naprawa:** Dodać `AbortSignal.timeout(8000)` do pętli strumienia.

### 3.3 `errorLog.js` — auto-tworzenie tabeli przez raw SQL
**Plik:** `/lib/errorLog.js` linie 55-60  
**Kod:**  
```js
const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/pgquery`, {
    method: 'POST',
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ query: createSql })
});
```
**Problem:** Używa nieistniejącego RPC `pgquery` — Supabase nie ma domyślnego RPC o tej nazwie. To działanie zawsze failuje (chyba że ktoś ręcznie dodał takie RPC). Kod cicho loguje błąd i kontynuuje.  
**Ryzyko:** Auto-tworzenie tabeli NIGDY nie działa — error_logs muszą być stworzone przez migrację SQL. Jest to martwy kod który może mylić.  
**Naprawa:** Usunąć auto-create, polegać tylko na migracji `20260527_error_logs.sql`.

### 3.4 `stats.js` — dostęp do wszystkich auth users przez service_role bez audytu
**Plik:** `/api/stats.js` linia 36  
**Kod:** `const { data: usersData } = await serviceClient.auth.admin.listUsers();`  
**Problem:** Każdy admin/moderator_users może pobrać listę wszystkich użytkowników (count). Mimo że zwracane są tylko statystyki, funkcja wczytuje do pamięci wszystkich użytkowników auth. Dla 1000+ uczniów lista może być duża. Brak logowania kto i kiedy odpytuje statystyki.  
**Naprawa:** Dodać log dostępu do `error_logs` + limit paginacji.

### 3.5 Brevo API key w nagłówku HTTP
**Plik:** `/api/send-email.js` linia 68  
**Kod:** `'api-key': process.env.BREVO_API_KEY`  
**Problem:** Klucz API Brevo jest przesyłany w nagłówku requestu wychodzącego z Vercel. Jeśli Vercel loguje wychodzące nagłówki (debug, monitoring), klucz może wyciec do logów.  
**Ryzyko:** Standardowe dla Brevo, ale warto być świadomym.  
**Naprawa:** Upewnić się, że logi Vercel nie przechwytują wychodzących requestów.

---

## 🔵 P4 — NISKIE / PRODUCTION READINESS

### 4.1 CSP `connect-src` zawiera martwy Librus proxy
**Plik:** `/vercel.json` linia 33  
**Fragment CSP:** `https://librus-proxy-production.up.railway.app`  
**Problem:** Domena martwego proxy (zwraca 404) jest nadal w CSP.  
**Naprawa:** Usunąć domenę z CSP.

### 4.2 Sesja używa `SameSite=Lax` zamiast `Strict`
**Plik:** `/lib/serverAuth.js` linia 52  
**Problem:** Dla endpointów zmieniających stan (login, signup, send-email), SameSite=Strict jest bezpieczniejsze.  
**Naprawa:** Zmienić na `Strict`, przetestować czy nie łamie flow (np. redirectów).

### 4.3 Rate limiting in-memory resetowany przy cold startach
**Plik:** Wszystkie endpointy auth (login, signup, reset-password, resend-confirmation, send-email)  
**Problem:** Przy cold starcie Vercel Function (bezczynność > 5 min), wszystkie rate limiting countery są resetowane. Attacker może poczekać na cold start i wykonać pełną pulę requestów od razu.  
**Uwaga:** Już oznaczone w komentarzach TODO, ale nadal nierozwiązane.

### 4.4 `Content-Security-Policy` ma `style-src-attr 'unsafe-inline'`
**Plik:** `/vercel.json` linia 33  
**Problem:** Polityka CSP zezwala na inline style atrybuty, co osłabia ochronę przed XSS.  
**Uwaga:** Już zaznaczone w poprzednim audycie.

### 4.5 Type mismatch w walidacji zgłoszeń (reports)
**Plik:** `/supabase/migrations/20260331_rewear_messaging_and_interest.sql` linie 450-491  
**Problem:** `reported_entity_id` jest typu `text`, ale dla niektórych encji porównanie jest bez cast'a (np. `p.id = new.reported_entity_id` gdzie `p.id` to `bigint`). PostgreSQL zrobi implicit cast, ale może to pomijać indeksy.  
**Naprawa:** Ujednolicić typ — użyć `::text` dla wszystkich porównań.

### 4.6 Feed.jsx — niepotrzebne parsowanie DOM po DOMPurify
**Plik:** `/src/features/feed/Feed.jsx` linie 198-215  
**Problem:** Funkcja `sanitizeFeedHtml()` parsuje string przez `DOMParser` a potem zwraca `wrapper.innerHTML` (linia 215). To podwójne parsowanie HTML jest niepotrzebne — DOMPurify już zwraca czysty HTML.  
**Ryzyko:** Niskie, ale każde parsowanie to dodatkowy wektor ataku.  
**Naprawa:** Użyć `DOMPurify.sanitize` z `RETURN_DOM_FRAGMENT` lub `RETURN_DOM` zamiast ręcznego parsowania.

---

## PODSUMOWANIE

| Priorytet | Liczba | Kluczowe ryzyka |
|-----------|--------|-----------------|
| 🔴 P1 | 2 | Hardcodowany email admina, hardcodowana domena fallback |
| 🟠 P2 | 3 | Librus proxy z hasłami, podwójne SMTP, wyciek providera |
| 🟡 P3 | 5 | Brak detekcji kradzieży tokena, slow loris, dead code errorLog, brak audytu stats.js |
| 🔵 P4 | 6 | CSP z martwym proxy, SameSite, cold start rate limit, style-src-attr unsafe-inline |

**Ocena ogólna: 6.5/10** — Poprzednie audyty wyeliminowały większość krytycznych błędów (hardcodowane hasła SMTP, `alreadyExists`, `generateLink` bez hasła), ale wciąż istnieją problemy produkcyjne i średnie ryzyka sekurytacyjne. Najbardziej palące: wyciek emaila admina i brak timeoutu na strumieniu requestów.

**Rekomendacja na teraz:**
1. Przenieść `adminEmail` do env
2. Usunąć martwy kod Librusa + domenę z CSP
3. Dodać timeout na `readJsonBody` stream
4. Zrefaktorować `createMailTransport()` na singleton
5. Usunąć martwy auto-create w `errorLog.js`
