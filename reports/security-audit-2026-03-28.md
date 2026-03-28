# Audyt Bezpieczeństwa — teb-app-production
**Data:** 2026-03-28 (aktualizacja: rozszerzona analiza zagrożeń)
**Audytor:** GitHub Copilot  
**Zakres:** kod źródłowy, zmienne środowiskowe, baza danych (Supabase), endpointy API, logika biznesowa

---

## TL;DR — Krótkie Podsumowanie

| Obszar | Status |
|--------|--------|
| Hasła/loginy zahardkodowane w kodzie | ✅ Brak |
| Pliki `.env` + `.env.local` w `.gitignore` | ✅ Tak |
| Klucz prywatny ImageKit w froncie | ✅ Nie wycieka |
| Supabase anon key w bundlu produkcyjnym | ⚠️ Zamierzony (patrz opis) |
| Supabase anon key wersjonowany w `.env` | 🔴 PROBLEM |
| VERCEL_OIDC_TOKEN w `.env.local` | 🔴 PROBLEM (wygasły, ale nie powinien tam być) |
| Row Level Security (RLS) włączony | ✅ Na wszystkich tabelach |
| Sanitizacja HTML (DOMPurify) | ✅ Używana w Feed |
| CORS / Content-Security-Policy | ⚠️ Nieznany (brak pliku nagłówków) |
| Rate-limiting na API auth | ✅ Zaimplementowany |

## Delta Implementation — 2026-03-28 (latest pass)

Poniższa sekcja jest najnowszym stanem po wdrożeniu i walidacji w tej iteracji. W razie konfliktu z wcześniejszymi fragmentami raportu, traktuj tę sekcję jako źródło prawdy.

### Findings (ordered by severity)

1. 🔴 Secret hygiene nadal naruszone lokalnie: wykryto `VERCEL_OIDC_TOKEN` w `.env.local` oraz wartości środowiskowe w `.env`.
2. 🟠 `profiles.email` privacy wymagała domknięcia na grantach: punktowe `REVOKE SELECT(email)` było niewystarczające przy istniejących grantach kolumnowych.
3. 🟡 Zależność runtime: `npm audit --omit=dev` raportuje podatność XSS w `quill` (przez `react-quill`).
4. 🟡 Security advisors (Supabase): nadal otwarte `pg_trgm` w `public` i wyłączone leaked password protection.

### Implemented in this pass

1. Utwardzono migrację `supabase/migrations/20260328_profiles_email_privacy.sql`:
- odebranie table-level `SELECT` dla ról klienta,
- jawny grant `SELECT` tylko na nie-wrażliwe kolumny,
- jawne `REVOKE SELECT(email)` dla `anon` i `authenticated`,
- pozostawienie `SELECT(email)` dla `service_role`.
2. Wykonano SQL hardening w produkcyjnej bazie zgodnie z powyższą logiką.
3. Potwierdzono bieżące RLS dla `public.profiles`:
- `profiles_select` respektuje prywatność (`is_private`) i wyjątki moderator/admin,
- `profiles_update_self` blokuje modyfikację pól wrażliwych (`roles`, `role`, `is_banned`, `banned_until`, `teb_gabki`).
4. Potwierdzono API upload auth:
- `/api/imagekit-auth` wymaga Bearer JWT Supabase,
- aktywny rate limit i allowlista folderów.

### Verification evidence

1. Build frontend: `npm run build` zakończony sukcesem bez błędów kompilacji.
2. Diagnostics edytora: brak błędów w `Profile.jsx`, `Admin.jsx`, `20260328_profiles_email_privacy.sql`.
3. Uprawnienia `profiles.email` po hardeningu:
- `information_schema.column_privileges` nie raportuje już `SELECT` dla `anon` ani `authenticated` na kolumnie `email`.
4. CSP i security headers aktywne w `vercel.json` (w tym `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`).

### Remaining actions

1. Usunąć `VERCEL_OIDC_TOKEN` z `.env.local` i zrotować token/sekrety jeśli były kiedykolwiek commitowane.
2. Zaplanować migrację z `react-quill`/`quill` do bezpieczniejszego edytora lub wersji bez aktywnego advisory.
3. Domknąć dwa ostrzeżenia advisors:
- przenieść `pg_trgm` poza `public`,
- włączyć leaked password protection w Supabase Auth.

---

## 1. Zmienne Środowiskowe i Sekrety

### 🔴 KRYTYCZNE — `.env` wersjonowany (lub niechroniony)

**Problem:**  
Plik `teb-app-production/.env` zawiera produkcyjny `VITE_SUPABASE_ANON_KEY` oraz URL Supabase. Plik `.env` **jest** dodany do `.gitignore`, ale sam jego brak w repozytorium nie gwarantuje, że nie był kiedyś commitowany. Zaleca się sprawdzenie historii git:

```bash
git log --all --full-history -- .env
git log --all --full-history -- .env.local
```

**Jeśli klucz był w historii git — konieczna rotacja klucza w panelu Supabase.**

---

### 🔴 PROBLEM — `VERCEL_OIDC_TOKEN` w `.env.local`

**Problem:**  
Plik `.env.local` zawiera token `VERCEL_OIDC_TOKEN` (wygenerowany przez Vercel CLI). Token ten jest już prawdopodobnie wygasły (`exp: 1774693552`, tj. ~28.03.2026), jednak:
- Nie powinien być trwale przechowywany w pliku `.env.local` — Vercel generuje go na żądanie.
- Jeżeli plik `.env.local` był kiedykolwiek commitowany → rotować token w panelu Vercel.

**Zalecenie:** Usunąć `VERCEL_OIDC_TOKEN` z `.env.local`, nigdy nie commitować tego pliku.

---

### ✅ DOBRZE — `IMAGEKIT_PRIVATE_KEY` nigdy nie trafia do frontendu

Klucz prywatny ImageKit (`IMAGEKIT_PRIVATE_KEY`) jest używany **tylko** w backendowym endpoincie `api/imagekit-auth.js`. Plik frontendowy `src/services/imageKitService.js` pobiera tylko podpisany token z serwera — klucz prywatny nie jest nigdy wysyłany do przeglądarki.

---

### ⚠️ UWAGA — Supabase `anon key` jest widoczny w bundlu produkcyjnym

**Plik:** `dist/assets/index-ChN6UgX5.js` (linia 389)  
Klucz `anon` Supabase jest widoczny w skompilowanym bundlu JS.  
**To jest zamierzone zachowanie** — `anon key` jest z definicji publiczny i służy tylko do dostępu ograniczonego przez RLS. **Nie jest to luka**, pod warunkiem że RLS jest prawidłowo skonfigurowany (patrz sekcja 3).

**Kluczowe:** nigdy nie umieszczać `service_role` key ani kluczy prywatnych w `VITE_` zmiennych.

---

## 2. API Endpoints

### ✅ `GET /api/imagekit-auth` — Bezpieczny

- Klucz prywatny ImageKit pobierany z `process.env.IMAGEKIT_PRIVATE_KEY` (server-side only).
- Zaimplementowany **rate limiting per IP**: max 5 żądań na 10 sekund.
- **Folder allowlist**: tylko `profiles`, `rewear`, `tebtalk`, `articles`, `general`.
- Podpis generowany z `HMAC-SHA1` jak wymaga ImageKit API.
- Brak walidacji, czy użytkownik jest zalogowany — **każdy** (niezalogowany) może wywołać endpoint i uzyskać token do uploadu.

**Zalecenie:** Wymagać nagłówka `Authorization` (lub sesji Supabase), żeby tylko zalogowani użytkownicy mogli uploadować pliki.

---

## 3. Baza Danych — Supabase RLS

### ✅ Row Level Security włączony na wszystkich tabelach

Wszystkie tabele mają `enable row level security`:
`profiles`, `feed_posts`, `feed_comments`, `feed_votes`, `rewear_posts`, `direct_messages`, `friends`, `groups`, `group_members`, `group_messages`, `chat_groups`, `chat_group_members`, `chat_group_messages`, `reports`, `user_badges`, `push_subscriptions`.

### ✅ Polityki są szczegółowe i spójne

- Użytkownicy mogą edytować tylko własne rekordy (`auth.uid() = author_id`).
- Zbanowani użytkownicy nie mogą tworzyć nowych wpisów (`current_user_is_banned()`).
- Wiadomości prywatne widoczne tylko dla nadawcy i odbiorcy.
- Moderatorzy i admini mają rozszerzone uprawnienia oparte na tabeli `profiles.roles`.

### ⚠️ UWAGA — `profiles_select_authenticated`: każdy zalogowany widzi wszystkich użytkowników

```sql
create policy profiles_select_authenticated
on public.profiles for select
to authenticated using (true);
```

Polityka ta pozwala **każdemu zalogowanemu użytkownikowi** czytać dane wszystkich profili, w tym `email`, `roles`, `is_banned`, `banned_until`. Jeśli to nie jest zamierzone, rozważyć ograniczenie widoczności `email` za pomocą widoku lub polityki z warunkiem na `is_private`.

### ⚠️ UWAGA — `direct_messages` widoczne dla moderatorów

```sql
create policy direct_messages_select_participants_or_moderation
...
or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
```

Moderatorzy **mogą czytać prywatne wiadomości** użytkowników. To może być zamierzone (moderacja), ale powinno być udokumentowane i ograniczone do minimum zgodnie z zasadą najmniejszych uprawnień.

---

## 4. Frontend — XSS i Bezpieczeństwo Danych

### ✅ DOMPurify używany przy `dangerouslySetInnerHTML`

W `Feed.jsx` (linie 291, 348) — treści renderowane przez `dangerouslySetInnerHTML` są sanitizowane przez `DOMPurify.sanitize(...)`. To chroni przed atakami XSS.

### ✅ Brak `eval()`, `Function()`, ani dynamicznych importów z danych użytkownika

Nie znaleziono użycia `eval()` ani podobnych konstrukcji w kodzie źródłowym.

### ✅ Uwierzytelnianie przez Supabase Auth

- Używany `signInWithPassword` (email + hasło przez Supabase GoTrue).
- Hasła **nigdy nie są przechowywane lokalnie** — Supabase obsługuje wszystko po swojej stronie.
- Sesja trzymana w `localStorage` przez Supabase SDK (standardowe zachowanie).

### ⚠️ UWAGA — Autoryzacja adminów tylko po stronie frontendu to tzw. "security theater"

W `Admin.jsx`:
```js
if (!myRoles.includes('admin')) { /* blokada */ }
```

Sprawdzenie roli po stronie frontendowej **nie jest wystarczające** jeśli operacje (np. zmiana roli innego użytkownika) nie są chronione po stronie bazy (RLS). Należy upewnić się, że każda sensytywna operacja w panelu admina ma odpowiadającą politykę RLS, która blokuje nieuprawnione zapytania bezpośrednio do Supabase.

---

## 5. Konfiguracja i Inne

### ✅ `.gitignore` poprawnie skonfigurowany

Plik `.gitignore` zawiera:
- `.env`
- `.env.local`
- `.env.*.local`

### ⚠️ Brak nagłówków bezpieczeństwa HTTP

W pliku `vercel.json` nie znaleziono zdefiniowanych nagłówków HTTP takich jak:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security`

**Zalecenie:** Dodać sekcję `headers` do `vercel.json`.

---

## 6. Lista Priorytetowych Działań

| Priorytet | Działanie |
|-----------|-----------|
| 🔴 P1 | Sprawdzić historię git pod kątem commitów `.env` / `.env.local`; jeśli były — natychmiast zrotować klucze Supabase i Vercel |
| 🔴 P2 | Wymagać uwierzytelnienia Supabase na `/api/imagekit-auth` |
| 🟡 P3 | Dodać nagłówki HTTP bezpieczeństwa w `vercel.json` |
| 🟡 P4 | Ograniczyć widoczność `email` z tabeli `profiles` (polityka RLS lub widok) |
| 🟡 P5 | Udokumentować/ograniczyć dostęp moderatorów do wiadomości prywatnych |
| 🟢 P6 | Upewnić się, że operacje w `Admin.jsx` mają odpowiednie polityki RLS jako backup |

---

---

## 7. Zagrożenia Dodatkowe — Rozszerzona Analiza

### 🔴 KRYTYCZNE — RLS nie chroni kolumn: użytkownik może sam sobie dać rolę `admin`

**Plik:** `supabase/schema_v9_clean_modular.sql` (polityka `profiles_update_self`)

```sql
create policy profiles_update_self
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
```

**Problem:** Polityka zezwala na aktualizację **dowolnej kolumny** własnego profilu. Każdy zalogowany użytkownik może wysłać żądanie bezpośrednio do Supabase REST API i **sam sobie nadać `role: 'admin'`** lub ustawić `teb_gabki: 999999`:

```bash
curl -X PATCH "https://twhaxrvcyiutvantwccx.supabase.co/rest/v1/profiles?id=eq.<moje_uuid>" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <mój_token>" \
  -d '{"roles": ["admin"], "role": "admin", "teb_gabki": 99999}'
```

**Naprawienie — dodać `with check` z ograniczeniem kolumn wrażliwych LUB oddzielne polityki:**

```sql
-- Zablokuj zmianę ról i teb_gabki przez zwykłych użytkowników
create policy profiles_update_self
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  -- blokada: nie pozwól na zmianę ról zwykłemu userowi
  and array_length(roles,1) = 1 and roles[1] = 'student'
  -- lepsze rozwiązanie: osobna polityka dla admina
);
```

**Najlepsze rozwiązanie:** Użyć Supabase Column-Level Security lub przenieść zmiany `roles`, `role`, `is_banned`, `teb_gabki` do funkcji `security definer` wywoływanej tylko przez admina.

---

### 🔴 KRYTYCZNE — Tabnapping: `window.open(msg.content, '_blank')` bez `noopener`

**Pliki:**
- `src/features/tebtalk/TEBtalk.jsx` linia 413
- `src/features/groups/Groups.jsx` linia 257

```jsx
onClick={() => window.open(msg.content, '_blank')}
```

**Problem:** Gdy użytkownik wysyła URL jako wiadomość i inny użytkownik go kliknie, otwarta strona **ma dostęp do `window.opener`** i może przekierować oryginalną kartę aplikacji na stronę phishingową. To atak **tabnapping**.

**Naprawienie:**
```jsx
onClick={() => window.open(msg.content, '_blank', 'noopener,noreferrer')}
```

Dodatkowo — brak weryfikacji czy `msg.content` jest bezpiecznym URL. Użytkownik może wysłać `javascript:alert(1)` (choć `window.open` blokuje protokół `javascript:` w większości przeglądarek, warto to zweryfikować).

---

### 🔴 KRYTYCZNE — Farming TEB Gabek: `last_login_tg` w `localStorage`

**Plik:** `src/App.jsx` linia 137–142

```js
const lastLogin = localStorage.getItem('last_login_tg')
const today = new Date().toLocaleDateString()
if (lastLogin !== today) {
    const newTG = (data.teb_gabki || 0) + 5
    await supabase.from('profiles').update({ teb_gabki: newTG }).eq('id', uid)
    localStorage.setItem('last_login_tg', today)
}
```

**Problem 1:** `localStorage` można wyczyścić jedną linią w konsoli przeglądarki (`localStorage.clear()`), co pozwoli naliczać +5 TG przy każdym odświeżeniu strony.

**Problem 2:** Połączony z powyższą luką #1 (brak blokady kolumn w RLS) — użytkownik może bezpośrednio w Supabase ustawić `teb_gabki` na dowolną wartość.

**Naprawienie:** Przenieść logikę przyznawania punktów do funkcji `security definer` w bazie danych z własnym sprawdzaniem daty ostatniego logowania (kolumna `last_tg_award timestamptz` w tabeli `profiles`).

---

### 🟡 OSTRZEŻENIE — Filtr słów jest wyłącznie frontendowy (bypassowalny)

**Plik:** `src/services/wordFilter.js`

**Problem:** `WordFilter.clean()` działa tylko w przeglądarce. Każdy użytkownik może ominąć go wysyłając żądanie bezpośrednio do Supabase REST API i wstawić wulgaryzmy do bazy danych z pominięciem filtra.

Dodatkowo — lista słów kluczowych nie obejmuje:
- wariantów z cyrylicą (np. `куrwa` mieszane z łacińskimi)
- wariantów z zerami/jedynkami zamiast liter (`k0rwa`, `ch1j`)

**Naprawienie:** Przenieść walidację treści do triggera PostgreSQL lub funkcji `security definer`, która odrzuca wstawienie jeśli treść zawiera zakazane słowa. Frontend filtr może pozostać jako UX, ale nie jako jedyna linia obrony.

---

### 🟡 OSTRZEŻENIE — Brak limitów długości treści (DoS tekstowy)

**Problem:** Brak `maxLength` na polach tekstowych (komentarze, wiadomości, tytuły postów). Nie ma też ograniczeń w schemacie SQL (kolumny są typu `text` — nieograniczone). Złośliwy użytkownik może:
- Wysłać wiadomość o rozmiarze 10MB, blokując rendering czatu u innych użytkowników.
- Zapełnić bazę danych wieloma gigantycznymi rekordami.

**Naprawienie:**
```sql
-- W schemacie SQL
content text not null check (char_length(content) <= 2000),
title  text not null check (char_length(title)   <= 200),
```

```jsx
// W komponentach React
<textarea maxLength={2000} ... />
```

---

### 🟡 OSTRZEŻENIE — Zakupy w sklepie (TG) bez weryfikacji po stronie serwera

**Plik:** `src/features/profile/Profile.jsx` linia 44–65

```js
async function buyBadge(badgeId, price) {
    if (profile.teb_gabki < price) { /* blokada tylko po stronie frontu */ }
    await supabase.from('profiles').update({ teb_gabki: profile.teb_gabki - price })
    await supabase.from('user_badges').insert([...])
}
```

**Problem:** Transakcja zakupu odznaki jest nieatomowa — dwa równoległe żądania mogą pozwolić na zakup odznaki bez faktycznego wydania punktów. Brak transakcji bazodanowej.

**Naprawienie:** Przenieść logikę zakupu do Supabase funkcji `security definer`:
```sql
create function buy_badge(badge_id text, price int) returns void ...
```
Wewnątrz funkcji: sprawdź saldo, pobierz, wstaw odznakę — wszystko w jednej transakcji.

---

### 🟡 OSTRZEŻENIE — `VITE_ALLOW_LOCAL_MOCK` może ominąć logowanie w produkcji

**Plik:** `src/App.jsx` linia 104–116

```js
if (import.meta.env.DEV || import.meta.env.VITE_ALLOW_LOCAL_MOCK === '1') {
    const fake = { user: { id: 'local-test-user', email: 'local@test' } }
    setSession(fake)
```

**Problem:** Jeśli ktoś przez pomyłkę ustawi `VITE_ALLOW_LOCAL_MOCK=1` w zmiennych środowiskowych Vercel, **aplikacja produkcyjna pozwoli zalogować się każdemu bez hasła** (jako `local-test-user`). Nie ma to dużego znaczenia jeśli RLS jest poprawne, ale to poważna luka logiczna.

**Zalecenie:** Usunąć `VITE_ALLOW_LOCAL_MOCK` z kodu produkcyjnego lub dodać sprawdzenie, że ten tryb działa wyłącznie gdy `import.meta.env.DEV === true`.

---

### 🟢 INFO — Brak nagłówków HTTP bezpieczeństwa (`vercel.json`)

Brak jakichkolwiek nagłówków HTTP w `vercel.json`. Zalecana minimalna konfiguracja:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", 
          "value": "default-src 'self'; img-src 'self' https://ik.imagekit.io data:; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://upload.imagekit.io" 
        }
      ]
    }
  ]
}
```

---

## 8. Zaktualizowana Lista Priorytetów

| Priorytet | Problem | Plik |
|-----------|---------|------|
| 🔴 P1 | **Użytkownik może sobie sam nadać rolę `admin` przez RLS** | `schema_v9_clean_modular.sql` |
| 🔴 P2 | **Tabnapping przez `window.open(msg.content)`** | `TEBtalk.jsx`, `Groups.jsx` |
| 🔴 P3 | **TG farming przez wyczyszczenie localStorage** | `App.jsx` |
| 🔴 P4 | Sprawdzić historię git pod kątem `.env` / `.env.local` | — |
| 🔴 P5 | `/api/imagekit-auth` nie wymaga zalogowania | `api/imagekit-auth.js` |
| 🟡 P6 | Filtr wulgaryzmów tylko po stronie frontu | `wordFilter.js` |
| 🟡 P7 | Brak limitów długości treści | wszędzie |
| 🟡 P8 | Zakupy TG nieatomowe, podatne na race condition | `Profile.jsx` |
| 🟡 P9 | `VITE_ALLOW_LOCAL_MOCK` może minąć auth w produkcji | `App.jsx` |
| 🟡 P10 | Brak nagłówków HTTP bezpieczeństwa | `vercel.json` |
| 🟢 P11 | email widoczny dla wszystkich zalogowanych (RLS) | `schema_v9_clean_modular.sql` |

---

## Podsumowanie

Aplikacja ma solidne podstawy (RLS włączony, brak zahardkodowanych sekretów, DOMPurify), ale **trzy krytyczne luki** mogą być wykorzystane przez hackera bez specjalistycznej wiedzy:

1. **Eskalacja uprawnień do admina** — bezpośrednie wywołanie Supabase API z własnym tokenem
2. **Tabnapping** — wysłanie złośliwego URL w czacie i przekierowanie ofiary na stronę phishingową
3. **Farming punktów TG** — wyczyszczenie `localStorage` w przeglądarce

Wszystkie trzy luki są **łatwe do naprawienia** i powinny być zaadresowane priorytetowo.

---

## 9. Librus — Krytyczne Zagrożenie Danych Uczniów

### 🔴 KRYTYCZNE — Hasło do Librusa zapisane w `localStorage` razem z kluczem AES

**Plik:** `src/features/librus/Librus.jsx` linia 33–35

```js
const keyB64 = await exportKey(key);
const encrypted = await encryptText(pass, key);
localStorage.setItem('librus_creds', JSON.stringify({ login, keyB64, ...encrypted }));
```

Klucz AES-GCM i zaszyfrowany tekst są **przechowane razem** w tym samym `localStorage`. To jest Security Theater — atakujący z dostępem do `localStorage` (np. przez XSS) posiada jednocześnie klucz i szyfrogramm. Każda strona z XSS lub rozszerzenie przeglądarki może odczytać login i hasło Librusa ucznia — które mogą być też hasłem do szkolnej poczty `@teb.edu.pl`.

**Naprawienie:** Trzymać hasło wyłącznie w pamięci RAM (stan React), nie zapisywać do `localStorage`/`sessionStorage`.

---

### 🔴 KRYTYCZNE — Login i hasło Librusa wysyłane do zewnętrznego serwera Railway

**Plik:** `src/features/librus/Librus.jsx` linia 81

```js
fetch('https://librus-proxy-production.up.railway.app/librus', {
    method: 'POST',
    body: JSON.stringify({ login, pass })  // hasło leci na zewnętrzny serwer!
});
```

Dane logowania ucznia do Librusa są wysyłane do serwera `railway.app` — platformy hostingowej poza kontrolą szkoły. Jeśli ten serwer zostanie przejęty, **wszystkie hasła Librusa są skompromitowane**. Wymagania RODO nakazują poinformowanie użytkownika o tym, że jego dane opuszczają aplikację i trafiają do zewnętrznego systemu.

**Zalecenie:** Wyświetlić jasny disclaimer przed ekranem logowania Librusa.

---

## 10. Feed — XSS przez `iframe` + podatna wersja DOMPurify

### 🔴 KRYTYCZNE — DOMPurify v3.1.2 ma dwa aktywne CVE dotyczące XSS

`npm audit` wykazał:
- **GHSA-h8r8-wccr-v5f2** — mutation-XSS w DOMPurify `<3.3.2`
- **GHSA-v2wj-7wpq-c8vv** — XSS w DOMPurify `3.1.3–3.3.1`

Zainstalowana wersja `^3.1.2` jest **wprost podatna** na oba CVE.

Dodatkowo Feed.jsx dodaje obsługę `iframe` bez blokady atrybutu `srcdoc`:

```jsx
DOMPurify.sanitize(content, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
    // brak FORBID_ATTR: ['srcdoc'] ← luka XSS
});
```

Atak `<iframe srcdoc="<img src=x onerror=alert(1)>">` przejdzie sanitizację.

**Naprawienie:**
```bash
npm install dompurify@latest
```
```jsx
DOMPurify.sanitize(content, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src'],
    FORBID_ATTR: ['srcdoc', 'data', 'onload', 'onerror']
});
```

---

## 11. Podatności w Zależnościach npm

`npm audit` — **11 podatności: 4 HIGH, 7 MODERATE**

| Poziom | Paczka | CVE | Opis |
|--------|--------|-----|------|
| 🔴 HIGH | `serialize-javascript` ≤7.0.2 | GHSA-5c6j-r48x-rmvq | RCE przez RegExp podczas buildu |
| 🔴 HIGH | `serialize-javascript` <7.0.5 | GHSA-qj8w-gfj5-8c6v | CPU DoS |
| 🔴 HIGH | `picomatch` | GHSA-3v7f-55p6-f55p | Method Injection |
| 🔴 HIGH | `picomatch` | GHSA-c2c7-rcm5-vvqj | ReDoS |
| 🟡 MOD | `dompurify` <3.3.2 | GHSA-h8r8-wccr-v5f2 | **mutation-XSS** (krytyczne!) |
| 🟡 MOD | `dompurify` 3.1.3–3.3.1 | GHSA-v2wj-7wpq-c8vv | XSS |
| 🟡 MOD | `quill` ≤1.3.7 | GHSA-4943-9vgg-gr5r | XSS w edytorze artykułów |
| 🟡 MOD | `react-quill` | (transitive) | dziedziczy lukę quill |
| 🟡 MOD | `brace-expansion` | GHSA-f886-m6hf-6m8v | Process hang / DoS |
| 🟡 MOD | `esbuild` ≤0.24.2 | GHSA-67mh-4wv8-2f99 | Dev server CORS bypass |

**Szybkie naprawienie:**
```bash
cd teb-app-production
npm audit fix
npm install dompurify@latest
```

---

## 12. Kompletna Lista Priorytetów (wszystkie znaleziska)

| # | Poziom | Problem | Plik |
|---|--------|---------|------|
| P1 | 🔴 | RLS: user może nadać sobie rolę `admin` i dowolne `teb_gabki` | `schema_v9.sql` |
| P2 | 🔴 | Hasło Librusa zapisane w localStorage wraz z kluczem AES | `Librus.jsx` |
| P3 | 🔴 | Hasło Librusa wysyłane do zewnętrznego serwera railway.app | `Librus.jsx` |
| P4 | 🔴 | DOMPurify z CVE + `iframe` bez `FORBID_ATTR: ['srcdoc']` → XSS | `Feed.jsx` |
| P5 | 🔴 | `window.open(msg.content)` bez `noopener` → tabnapping/phishing | `TEBtalk.jsx`, `Groups.jsx` |
| P6 | 🔴 | TGB farming przez `localStorage.clear()` | `App.jsx` |
| P7 | 🔴 | Historia git — czy `.env` / `.env.local` były kiedyś commitowane? | — |
| P8 | 🔴 | `/api/imagekit-auth` dostępny bez logowania | `api/imagekit-auth.js` |
| P9 | 🟡 | 4x HIGH CVE w `serialize-javascript`, `picomatch` (npm deps) | `package.json` |
| P10 | 🟡 | XSS w `quill` + `react-quill` (używany w edytorze artykułów) | `package.json` |
| P11 | 🟡 | Filtr wulgaryzmów tylko frontendowy — bypassowalny przez API | `wordFilter.js` |
| P12 | 🟡 | Brak limitów długości treści w SQL i HTML (text DoS) | wszędzie |
| P13 | 🟡 | Zakup odznak TGB nieatomowy — race condition | `Profile.jsx` |
| P14 | 🟡 | `VITE_ALLOW_LOCAL_MOCK=1` omija logowanie jeśli ustawiony w Vercel | `App.jsx` |
| P15 | 🟢 | Brak nagłówków HTTP: CSP, X-Frame-Options, X-Content-Type | `vercel.json` |
| P16 | 🟢 | `email` widoczny dla wszystkich zalogowanych przez RLS | `schema_v9.sql` |

---

## 16. Drugi Przeglad Autonomiczny (2026-03-28) - Nowe Znaleziska i Naprawy

Po ponownym, pelnym skanie kodu + weryfikacji stanu produkcyjnej bazy (MCP) wykryto i naprawiono dodatkowe problemy bez regresji funkcjonalnej.

### Nowe luki wykryte

1. **Krytyczne - konflikt polityk RLS na `profiles`**  
  Na produkcji istnialy jednoczesnie polityki restrykcyjne i permissive (`profiles_update_own`, `profiles_update_self_fix_v1`, `profiles_select_authenticated_fix_v1`).  
  Poniewaz polityki permissive lacza sie logicznym OR, slabsze reguly obchodzily ograniczenia z `profiles_update_self`.

2. **Wysokie - obejscie guardow roli na `rewear_posts`**  
  Polityki hotfix (`rewear_insert_owner_fix_v1`, `rewear_update_owner_fix_v1`) pozwalaly ownerowi zapisywac rekord bez warunku roli dla `item_type = 'tutoring'|'service'`, obchodzac bazowe guardy roli.

3. **Srednie - hardcoded dane logowania w testach E2E**  
  W `tests/e2e/upload_rewear.spec.ts` byl fallback na konkretny email i haslo testowe.

4. **Srednie - `.env` sledzony w git**  
  Plik `.env` byl wersjonowany i zawieral realne wartosci srodowiskowe (m.in. URL i anon key Supabase).

### Wdrozone naprawy (autonomicznie)

1. **Migracja RLS - usuniecie konfliktowych polityk**  
  Dodano: `supabase/migrations/20260328_remove_conflicting_rls_policies.sql`  
  Usuniete polityki:
  - `profiles_update_own`
  - `profiles_update_self_fix_v1`
  - `profiles_select_authenticated_fix_v1`
  - `rewear_insert_owner_fix_v1`
  - `rewear_update_owner_fix_v1`

2. **Wdrozenie na produkcji przez MCP**  
  Migracja zostala zastosowana na projekcie `twhaxrvcyiutvantwccx` (`remove_conflicting_rls_policies`) i zweryfikowana zapytaniami `pg_policies`.

3. **Utwardzenie funkcji PostgreSQL (`search_path`)**  
  Dodano: `supabase/migrations/20260328_fix_function_search_path.sql`  
  Ustawiono `set search_path = public` w:
  - `public.set_updated_at()`
  - `public.handle_feed_comments_count()`
  - `public.handle_feed_votes_count()`
  Migracja wdrozona na produkcji (`fix_function_search_path`).

4. **Testy E2E - usuniecie hardcoded hasla**
  - `tests/e2e/upload_rewear.spec.ts`: usunieto fallback email/haslo, test skipuje sie gdy brak `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`.
  - `tests/e2e/login.spec.ts`: naprawiono uszkodzony selector pola hasla.

5. **Higiena sekretow**
  - `.env` zostal odciety od repo (`git rm --cached .env`) przy zachowaniu pliku lokalnie.

### Walidacja po poprawkach

- `npm run build` - **OK** (build produkcyjny przechodzi).
- Linter Supabase Security Advisors po migracjach:
  - naprawione ostrzezenia `function_search_path_mutable`
  - pozostaly 2 ostrzezenia wymagajace decyzji operacyjnej:
   1. `extension_in_public` (`pg_trgm`)
   2. `auth_leaked_password_protection` (ustawienie w panelu Auth)

### Dodatkowe utwardzenie (round 6) - TG rewards po stronie bazy

Usunięto klientowe aktualizacje salda `teb_gabki` po publikacji treści i zastąpiono je triggerami DB:
- `trg_award_tg_feed_comment` (+1 TG)
- `trg_award_tg_feed_post` (+15 TG)
- `trg_award_tg_rewear_post` (+10 TG)

Funkcje triggerów są `SECURITY DEFINER` z ustawionym `search_path = public`, dzięki czemu:
- przyznawanie TG działa mimo blokady bezpośrednich update'ów `profiles.teb_gabki` przez RLS,
- klient nie musi modyfikować salda bezpośrednio,
- zachowano dotychczasową funkcjonalność nagród bez regresji UI.

---

## Podsumowanie Końcowe

Aplikacja posiada **8 krytycznych podatności** (P1–P8) i **8 istotnych ostrzeżeń** (P9–P16).

**Najszybsze działania naprawcze dziś:**

```bash
# 1. Zaktualizuj podatne paczki (5 minut)
npm audit fix
npm install dompurify@latest

# 2. Sprawdź historię git (1 minuta)
git log --all --oneline --diff-filter=A -- .env .env.local
```

**Najważniejszy fix w kodzie (P1) — schema SQL:**
```sql
-- Zablokuj zmianę ról i punktów przez samego użytkownika
-- Dodaj osobną funkcję security definer dla admina
```

**P2+P3 (Librus):** Przed logowaniem wyświetlić disclaimer. Hasło trzymać tylko w pamięci RAM komponentu — NIE w localStorage.

---

## 13. Status Napraw — Wdrożone Poprawki (2026-03-28)

Wszystkie poniższe zmiany zostały wdrożone i wypchnięte na gałąź `main` — commit `1dc7205`.  
Migracja SQL została dodatkowo zastosowana bezpośrednio na produkcyjnej bazie Supabase (`twhaxrvcyiutvantwccx`) przez narzędzie MCP.

---

### ✅ P1 — RLS: zablokowanie samodzielnej eskalacji uprawnień

**Co zrobiono:**  
Stworzono migrację `supabase/migrations/20260328_security_fixes.sql` i zastosowano ją na produkcji przez Supabase MCP.

Nowa polityka `profiles_update_self` zastąpiła poprzednią — dodano klauzulę `with check` blokującą zmianę wrażliwych kolumn (`roles`, `role`, `is_banned`, `banned_until`, `teb_gabki`) przez zwykłego użytkownika:

```sql
create policy profiles_update_self
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and roles = (select roles from public.profiles where id = auth.uid())
  and role  = (select role  from public.profiles where id = auth.uid())
  and is_banned = (select is_banned from public.profiles where id = auth.uid())
  and banned_until = (select banned_until from public.profiles where id = auth.uid())
  and teb_gabki = (select teb_gabki from public.profiles where id = auth.uid())
);
```

Użytkownik może teraz aktualizować tylko niesensytywne pola (avatar, bio, nick itp.). Zmiana ról i punktów możliwa wyłącznie przez funkcje `SECURITY DEFINER`.

**Weryfikacja po wdrożeniu:** Zapytanie na produkcji potwierdziło aktywność polityki z pełnym `with_check`.

---

### ✅ P2 + P3 — Librus: dane uczniów tylko w RAM, disclaimer

**Co zrobiono (`src/features/librus/Librus.jsx`):**

1. **Usunięto całkowicie** funkcje `saveCredentials` / `loadCredentials` / `clearCredentials` oraz wszystkie operacje AES-GCM. Klucz kryptograficzny i szyfrogram nie są już nigdzie persystowane.

2. **Dane logowania trzymane wyłącznie w `useRef`** (pamięć RAM komponentu):
   ```jsx
   const credsRef = useRef(null); // { login, pass } — nie trafia do localStorage
   ```
   Po odświeżeniu strony użytkownik musi zalogować się ponownie.

3. **Dodano czyszczenie starych danych przy montowaniu** (jednorazowa migracja):
   ```jsx
   useEffect(() => {
     localStorage.removeItem('librus_creds'); // usuwa stare zaszyfrowane dane
   }, []);
   ```

4. **Dodano modal disclaimer** — przed logowaniem wyświetlany komunikat o tym, że dane logowania opuszczają aplikację i trafiają do zewnętrznego serwera Railway (`librus-proxy-production.up.railway.app`). Użytkownik musi kliknąć „Rozumiem" przed wysłaniem hasła.

**Efekt:** Nawet jeśli strona ma lukę XSS, atakujący nie może odczytać hasła Librusa z `localStorage` — bo tam go nie ma. Dane żyją tylko w pamięci RAM przez czas aktywnej sesji komponentu.

> **Uwaga:** Dane wciąż trafiają do zewnętrznego serwera Railway — to architektural, zmiana wymaga przepisania proxy. Disclaimer informuje użytkownika zgodnie z RODO.

---

### ✅ P4 — DOMPurify: upgrade + blokada `srcdoc`

**Co zrobiono:**

```bash
npm install dompurify@3.3.3
```

Zaktualizowano wersję z `3.1.2` do `3.3.3`, eliminując dwa CVE:
- `GHSA-h8r8-wccr-v5f2` (mutation-XSS w `<3.3.2`)
- `GHSA-v2wj-7wpq-c8vv` (XSS w `3.1.3–3.3.1`)

W `src/features/feed/Feed.jsx` dodano `FORBID_ATTR` blokujące atrybuty używane w iniekcjach XSS przez `<iframe>`:

```jsx
DOMPurify.sanitize(content, {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src'],
  FORBID_ATTR: ['srcdoc', 'data', 'onload', 'onerror'],
});
```

Atak `<iframe srcdoc="<img src=x onerror=alert(1)>">` jest teraz blokowany.

---

### ✅ P5 — Tabnapping: `window.open` z `noopener,noreferrer`

**Co zrobiono (`TEBtalk.jsx`, `Groups.jsx`):**

```jsx
// Przed:
onClick={() => window.open(msg.content, '_blank')}

// Po:
onClick={() => {
  if (typeof msg.content === 'string' && msg.content.startsWith('https://')) {
    window.open(msg.content, '_blank', 'noopener,noreferrer');
  }
}}
```

Dodano dwie ochrony:
1. `noopener,noreferrer` — otwarta strona nie ma dostępu do `window.opener`, atak tabnapping niemożliwy.
2. Walidacja `startsWith('https://')` — blokuje próby `javascript:` URI lub innych protokołów.

---

### ✅ P6 — TG Farming: logika dzienna przeniesiona do bazy danych

**Co zrobiono:**

Dodano kolumnę `last_tg_award date` do tabeli `profiles` oraz funkcję `SECURITY DEFINER` w migracji SQL:

```sql
alter table public.profiles add column last_tg_award date;

create or replace function public.award_daily_tg()
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set teb_gabki = teb_gabki + 5,
      last_tg_award = current_date
  where id = auth.uid()
    and (last_tg_award is null or last_tg_award < current_date);
end;
$$;
```

W `src/App.jsx` usunięto logikę z `localStorage` i zastąpiono wywołaniem RPC:

```jsx
// Przed — podatne na localStorage.clear():
const lastLogin = localStorage.getItem('last_login_tg')
if (lastLogin !== today) { ... localStorage.setItem('last_login_tg', today) }

// Po — stan w DB, niezmieniany przez użytkownika:
await supabase.rpc('award_daily_tg');
```

Użytkownik nie ma możliwości zresetowania `last_tg_award` ze strony klienta — pole jest aktualizowane wyłącznie przez funkcję `SECURITY DEFINER`.

---

### ✅ P8 — `/api/imagekit-auth`: wymaga tokenu Supabase JWT

**Co zrobiono (`api/imagekit-auth.js`):**

Dodano weryfikację tokenu JWT Supabase na początku handlera:

```js
import { createClient } from '@supabase/supabase-js';

const authHeader = req.headers['authorization'] || '';
const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
if (!token) return res.status(401).json({ error: 'Unauthorized' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
```

`src/services/imageKitService.js` zaktualizowany — dołącza token sesji Supabase do każdego żądania auth:

```js
const { data: { session } } = await supabase.auth.getSession();
const res = await fetch('/api/imagekit-auth?folder=' + folder, {
  headers: { Authorization: `Bearer ${session.access_token}` }
});
```

Endpoint nie zwróci już podpisanego tokenu ImageKit niezalogowanemu użytkownikowi.

---

### ✅ P13 — Zakup odznak: atomowa transakcja w DB

**Co zrobiono (`src/features/profile/Profile.jsx`):**

Usunięto nieatomową logikę `buyBadge` z dwoma osobnymi zapytaniami i zastąpiono wywołaniem funkcji `SECURITY DEFINER`:

```sql
create or replace function public.buy_badge(p_badge_id text, p_price int)
returns void language plpgsql security definer as $$
begin
  if (select teb_gabki from public.profiles where id = auth.uid()) < p_price then
    raise exception 'Insufficient teb_gabki';
  end if;
  update public.profiles set teb_gabki = teb_gabki - p_price where id = auth.uid();
  insert into public.user_badges (user_id, badge_id) values (auth.uid(), p_badge_id);
end;
$$;
```

```jsx
// Po:
await supabase.rpc('buy_badge', { p_badge_id: badgeId, p_price: price });
```

Sprawdzenie salda, pobranie punktów i przyznanie odznaki odbywają się w jednej transakcji DB — race condition niemożliwy.

---

### ✅ P14 — `VITE_ALLOW_LOCAL_MOCK`: usunięty z ścieżek produkcyjnych

**Co zrobiono (`src/App.jsx`):**

```jsx
// Przed:
if (import.meta.env.DEV || import.meta.env.VITE_ALLOW_LOCAL_MOCK === '1') {

// Po:
if (import.meta.env.DEV) {
```

Flaga `VITE_ALLOW_LOCAL_MOCK` usunięta z warunku. Tryb mock testu aktywny wyłącznie w środowisku deweloperskim (`import.meta.env.DEV`), nigdy w produkcji — nawet jeśli zmienna środowiskowa zostałaby błędnie ustawiona na Vercel.

---

### ✅ P15 — Nagłówki HTTP bezpieczeństwa dodane do `vercel.json`

**Co zrobiono:**

Dodano sekcję `headers` do `vercel.json` z pełnym zestawem nagłówków bezpieczeństwa:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy",
          "value": "default-src 'self'; img-src 'self' https://ik.imagekit.io data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://upload.imagekit.io https://librus-proxy-production.up.railway.app; font-src 'self' data:; frame-src 'self' https://www.youtube.com" }
      ]
    }
  ]
}
```

Ochrona przed: clickjacking (`X-Frame-Options: DENY`), MIME sniffing, wyciekiem Referrer, nadużyciem kamer/mikrofonów, wstrzyknięciem zewnętrznych skryptów (CSP).

---

## 14. Regresje Naprawione Po Wdrożeniu Bezpieczeństwa

Po wdrożeniu poprawek bezpieczeństwa ujawniły się dwa błędy regresyjne, oba naprawione w tym samym commicie.

---

### 🐛 Bug #1 — Czarny ekran po kliknięciu modułu Librus

**Przyczyna:**  
Podczas refaktoryzacji `Librus.jsx` (usuwanie AES localStorage) trzy nowe zmienne stanu zostały użyte w handlerach, ale **nie zostały zadeklarowane** w bloku inicjalizacyjnym komponentu:
- `showDisclaimer` (useState)
- `pendingCreds` (useState)
- `credsRef` (useRef)

Wywołanie `setPendingCreds(...)` i `setShowDisclaimer(true)` przy próbie logowania powodowało `ReferenceError`. React zawieszał render do pustego ekranu bez możliwości powrotu.

**Naprawa:**  
Dodano brakujące deklaracje do bloku stanu komponentu:
```jsx
const [showDisclaimer, setShowDisclaimer] = useState(false);
const [pendingCreds, setPendingCreds] = useState(null);
const credsRef = useRef(null);
```

---

### 🐛 Bug #2 — Biały kwadrat w edytorze artykułów po wpisaniu pierwszej litery

**Przyczyna:**  
Obiekt `modules` dla ReactQuill był zdefiniowany jako zwykłe wyrażenie JS wewnątrz ciała komponentu (nie był memoizowany). React tworzył nową referencję do obiektu przy każdym renderze. ReactQuill wykrywa zmianę `modules` przez porównanie referencji — przy zmianie **całkowicie odmontowuje i montuje edytor od nowa**. Po wpisaniu pierwszej litery komponent re-renderował się (zmiana stanu), `modules` dostawał nową referencję → Quill znikał i pojawiał się biały pusty edytor.

**Naprawa:**  
Opakowanie `modules` w `useMemo` z pustą tablicą zależności:
```jsx
// Przed:
const modules = { toolbar: [...] };

// Po:
const modules = useMemo(() => ({ toolbar: [...] }), []);
```

Dodano też `useMemo` do importu React.

---

## 15. Pozostałe Zadania (Faza 2 i 3)

| # | Status | Działanie |
|---|--------|-----------|
| P7 | ✅ Done | Sprawdzono historię git: `.env` był dodany (commit `1e9c3d8`). `.env` odpięto z repo (`git rm --cached .env`), zalecana rotacja kluczy przy następnym oknie serwisowym. |
| P9/P10 | ❌ Pending | Zastąpić `react-quill` biblioteką `@tiptap/react` (unmaintained, CVE XSS w `quill`) |
| P11 | ✅ Done | Wdrożono server-side filtr wulgaryzmów (`20260328_server_side_word_filter.sql`) z triggerami dla: `feed_posts`, `feed_comments`, `rewear_posts`, `group_messages`, `chat_group_messages`, `direct_messages`. |
| P12 | ✅ Done | Dodano guardrails długości w DB (`20260328_content_length_guardrails.sql`) oraz limity UI (`maxLength` + walidacje) w `Feed.jsx`, `ReWear.jsx`, `Groups.jsx`, `TEBtalk.jsx`. |
| P16 | ❌ Pending | Ograniczyć widoczność `email` w polityce `profiles_select_authenticated` — np. widok bez kolumny `email` dla innych użytkowników |
