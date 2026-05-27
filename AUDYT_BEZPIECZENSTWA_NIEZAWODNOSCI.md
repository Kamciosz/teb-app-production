# KOMPLEKSOWY AUDYT BEZPIECZEŃSTWA I NIEZAWODNOŚCI — TEB-App
**Data:** 2026-03-31  
**Projekt:** /Users/szymonsosnowski/Desktop/teb-app-production/  
**Środowisko:** Vercel + Supabase + SMTP Cyber Folks  
**Użytkownicy:** 1000+ uczniów

---

## SPIS TREŚCI
1. [AUTENTYKACJA I SESJE](#1-autentykacja-i-sesje)
2. [AUTORYZACJA (RBAC)](#2-autoryzacja-rbac)
3. [SUPABASE RLS I SCHEMAT BAZY](#3-supabase-rls-i-schemat-bazy)
4. [API ENDPOINTY](#4-api-endpointy)
5. [KLIENT (FRONTEND)](#5-klient-frontend)
6. [INFRASTRUKTURA](#6-infrastruktura)
7. [ZALEŻNOŚCI](#7-zależności)
8. [NIEZAWODNOŚĆ](#8-niezawodność)
9. [ZALECENIA NAPRAWCZE](#9-zalecenia-naprawcze)

---

## 1. AUTENTYKACJA I SESJE

### 1.1 Signup — `/api/auth/signup.js` ✅
- Używa `Supabase Admin API` (`service_role key`) do `createUser` z `email_confirm: false` — poprawnie (konto wymaga weryfikacji e-mail)
- Generuje link potwierdzający przez `admin.generateLink()` — poprawnie
- Wysyła e-mail przez **nodemailer** → SMTP Cyber Folks (s68.cyber-folks.pl)
- **Walidaacja wejścia:** regex e-mail, min 8 znaków hasła, max 80 znaków nazwy, domena @teb.edu.pl
- **Rate limiting:** per-IP (20/15min) i per-email (5/15min) — in-memory Map
- **Origin check:** `requireSameOrigin(req, res)` — sprawdza poprawność
- **Email maskowanie:** w logach email jest maskowany (pierwsze 2 znaki + ***)
- **Uwaga:** Rate store jest globalny (`globalThis.__tebSignupRateStore`) — resetuje się przy cold start Vercel (serverless!)
- **UWAGA KRYTYCZNA:** Zwraca `createData.user` w odpowiedzi JSON — ujawnia dane użytkownika (w tym `id`, `email` potwierdzony, `created_at`) w body odpowiedzi (linia 227)

### 1.2 Login — `/api/auth/login.js` ✅
- Używa `supabase.auth.signInWithPassword()` — poprawnie
- Ustawia ciasteczka przez `setSessionCookies(res, session)` — HttpOnly, SameSite=Lax, Secure (w produkcji), Path=/
- **Rate limiting:** per-IP 10/15min
- Zwraca `access_token`, `expires_at`, `expires_in`, `token_type`, `user` w odpowiedzi — standardowe
- **Refresh token NIE jest zwracany** klientowi (bezpieczne)
- **Uwaga:** Rate store również in-memory — reset przy cold start

### 1.3 Logout — `/api/auth/logout.js` ✅
- Czyści ciasteczka (`clearSessionCookies`)
- Origin check — poprawnie
- Metoda tylko POST — poprawnie

### 1.4 Session — `/api/auth/session.js` ✅
- Odczytuje ciasteczka i próbuje autoryzację przez `getUser(accessToken)`
- Jeśli token wygasł, próbuje refresh przez `refreshSession(refresh_token)`
- **Rotacja refresh tokena:** TAK — `setSessionCookies(res, data.session)` po refresh
- Jeśli refresh nie działa, czyści ciasteczka

### 1.5 Reset Password — `/api/auth/reset-password.js` ✅
- Rate limiting: per-IP (8/1h), per-email (5/1h)
- **Walidaacja redirectTo:** sprawdza, czy hostname redirect URL zgadza się z nagłówkiem Host — **zabezpieczenie przed open redirect**
- Używa `supabase.auth.resetPasswordForEmail()`
- Origin check — poprawnie

### 1.6 Resend Confirmation — `/api/auth/resend-confirmation.js` ✅
- Rate limiting: per-IP 12/15min, per-email 4/15min
- **Ochrona enumeracji kont:** zwraca `200 { ok: true }` nawet gdy email nie istnieje lub jest nieprawidłowy (linia 127)
- Używa `supabase.auth.resend({ type: 'signup', email })`

### 1.7 Ciasteczka sesji — `lib/serverAuth.js`
| Parametr | Wartość |
|---|---|
| `teb_access_token` | HttpOnly, SameSite=Lax, Secure (prod), Path=/, Max-Age=expires_in-30 |
| `teb_refresh_token` | HttpOnly, SameSite=Lax, Secure (prod), Path=/, Max-Age=30 dni |
| **SameSite** | Lax (nie Strict — bezpieczne, ale Strict jest bezpieczniejsze) |
| **Secure** | Tylko w produkcji (NODE_ENV !== development) |
| **Path** | / |
| **Rotacja refresh** | TAK (przy każdym odczycie sesji) |

**Znalezione problemy:**
❌ **SameSite=Lax, nie Strict** — Strict jest bezpieczniejsze dla refresh tokena  
❌ **Secure flag brak w dev** — może być problem, jeśli dev testuje się na HTTPS  
✅ HttpOnly — ustawione  
✅ Path=/ — poprawne  
✅ No cookies expire po wylogowaniu  
✅ Token refresh — działa rotacja  

---

## 2. AUTORYZACJA (RBAC)

### 2.1 Role system
Role istniejące: `admin`, `moderator_users`, `moderator_content`, `editor`, `teacher`, `tutor`, `freelancer`, `su_member`, `student`
- `role` (pojedyncza, legacy) — domyślnie 'student'
- `roles` (tablica, nowoczesna) — domyślnie `['student']`

### 2.2 RLS jako brama autoryzacji ✅
Wszystkie kluczowe decyzje autoryzacyjne są podejmowane przez RLS (patrz sekcja 3)

### 2.3 API middleware
⚠️ **Wszystkie API endpointy używają `requireSameOrigin()`** — nie sprawdzają bezpośrednio roli użytkownika. Polegają na tym, że:
- Sesja jest wymagana do odczytu (cookie-based)
- Supabase anon key w API routes nie ma uprawnień do modyfikacji wrażliwych danych
- RLS blokuje nieautoryzowany dostęp

### 2.4 Eskalacja ról przez API
❌ **Potencjalnie możliwa przez bezpośrednie REST API Supabase** — jeśli atakujący ma access_token, może próbować bezpośrednio uderzać w Supabase REST API. **Jednak:**
- RLS blokuje zmiany ról (`profiles_update_self` wymaga, aby roles/role były identyczne z istniejącymi)
- `enforce_safe_profile_self_update()` trigger blokuje zmiany wrażliwych pól

**Ryzyko eskalacji: NISKIE** — RLS + trigger zapewniają wielowarstwową ochronę.

---

## 3. SUPABASE RLS I SCHEMAT BAZY

### 3.1 Schemat bazy danych
**Tabele:** profiles, feed_posts, feed_comments, feed_votes, rewear_posts, user_badges, push_subscriptions, friends, groups, group_members, group_messages, chat_groups, chat_group_members, chat_group_messages, direct_messages, reports, uploads, user_blocks, moderation_audit_log, punishment_appeals, rewear_interests, rewear_conversations, rewear_messages

### 3.2 RLS — włączone na WSZYSTKICH tabelach ✅
RLS jest włączone na każdej tabeli.

### 3.3 Kluczowe polityki RLS

**profiles:**
- `profiles_select`: publiczne profile widoczne dla każdego, prywatne tylko dla właściciela/admin/moderator_users
- `profiles_update_self`: **zabrania zmiany** `roles`, `role`, `is_banned`, `banned_until`, `teb_gabki` przez użytkownika
- `profiles_update_admin`: admin może modyfikować każdy profil
- `profiles_delete_admin`: tylko admin może usuwać profile

**feed_posts:**
- SELECT: true (publiczne)
- INSERT/UPDATE/DELETE: tylko autor lub admin/editor/moderator_content

**Rewear, Messages, Friends, Groups:** wszystkie mają odpowiednie polityki

**Blokowanie użytkowników i DM:**
- `direct_messages_select`: sprawdza blokady (nie można czytać DM z/od zablokowanego)
- `user_blocks_insert_self`: wymaga, że użytkownik nie jest zbanowany
- `friends_insert_self`: wymaga, że nie jest zbanowany i nie ma blokad

**Email privacy:**
- `profiles_email_privacy.sql`: `email` kolumna jest **niewidoczna dla anon i authenticated** — tylko service_role ma dostęp

### 3.4 SECURITY DEFINER functions ✅
Wszystkie funkcje dotykające wrażliwych danych (has_role, has_any_role, award_daily_tg, buy_badge, itp.) używają `SECURITY DEFINER` z `SET search_path = public`.

### 3.5 Content guardrails
- Długość pól ograniczona (`NOT VALID` constraints):
  - feed_posts.title ≤ 200, content ≤ 12000
  - feed_comments.content ≤ 2000
  - rewear_posts.title ≤ 200, description ≤ 5000
  - messages (direct/group/chat) ≤ 2000
  - profiles.bio ≤ 160

### 3.6 Serwerowy filtr wulgaryzmów
- Funkcja `has_profanity()` — normalizuje tekst (leetspeak, polskie znaki → ASCII)
- Trigger `enforce_clean_content()` na WSZYSTKICH tabelach z treścią użytkownika
- **Obejście:** sprawdza tylko rewear_posts.description z odcięciem `|META:` — metadane w description mogą zawierać ominięcie

### 3.7 System zgłoszeń (reports)
- Trigger `validate_and_limit_report_insert()`:
  - Max 5 raportów/24h
  - Brak duplikatów w ciągu 12h
  - Cooldown typu zgłoszenia: 5 minut
  - Walidacja istnienia zgłoszonego obiektu

### 3.8 Moderation audit trail
- `moderation_audit_log` — pełny dziennik działań moderacyjnych
- `punishment_appeals` — system odwołań od kar
- WSZYSTKIE zmiany ban/role/status raportów są logowane automatycznie przez triggery

### 3.9 Znalezione problemy

❌ **Duplikacja migracji:** `20260327_init_schema.sql` i `20260327154621_init_schema.sql` są IDENTYCZNE — powoduje konflikt przy migracji  
❌ **Schematy v9, v10 w supabase/:** pliki `schema_v9_clean_modular.sql` i `schema_v10_final.sql` to pełne schematy, które mogą być niezsynchronizowane z migracjami krok po kroku  
❌ **`NOT VALID` constraints:** ograniczenia długości dodane jako `NOT VALID` — nie egzekwują się na istniejących wierszach (tylko nowe dane są sprawdzane)  
❌ **Ban check (`current_user_is_banned`):** działa tylko w triggerach INSERT dla DM/friends — ale **nie ma go w `direct_messages_insert` dla istniejących konwersacji** (po pierwszej wiadomości, zbanowany użytkownik może wysłać kolejną)  
❌ **Brak RLS na `moderation_audit_log` dla INSERT:** każdy authenticated może INSERT? Sprawdzam... Polityki: SELECT dla moderatorów/targetu, INSERT brak — ale trigger `audit_punishment_appeal_submission` robi INSERT. RLS INSERT nie jest zdefiniowany. ✅ UPDATE tylko dla moderatorów.  

**Poprawione:** granty na `profiles.email` tylko dla service_role  

---

## 4. API ENDPOINTY

### 4.1 Lista wszystkich endpointów (5 plików)

| Endpoint | Metoda | Auth | Rate Limit | Origin Check | Walidacja |
|---|---|---|---|---|---|
| `/api/auth/signup` | POST | Service Role | IP 20/15min, Email 5/15min | TAK | email regex, domena, hasło ≥8, nazwa ≤80 |
| `/api/auth/login` | POST | Anon Key | IP 10/15min | TAK | email, hasło wymagane |
| `/api/auth/logout` | POST | Cookie | NIE | TAK | - |
| `/api/auth/session` | GET | Cookie | NIE | TAK | - |
| `/api/auth/reset-password` | POST | Anon Key | IP 8/1h, Email 5/1h | TAK | email wymagany, redirectTo walidowany |
| `/api/auth/resend-confirmation` | POST | Anon Key | IP 12/15min, Email 4/15min | TAK | email regex, domena |
| `/api/imagekit-auth` | GET/POST | Cookie (sesja) | IP 5/10s | NIE (sesja) | folder dozwolony: profiles, rewear, tebtalk, articles, general |
| `/api/send-email` | POST | Origin check | IP 20/1h, Recipient 8/1h | TAK | email regex, subject ≤200, body ≤50000 |

### 4.2 Rate limiting — problem architektoniczny ⚠️
WSZYSTKIE rate limiting stores używają `globalThis.__teb*RateStore` — czyli in-memory Map w Vercel serverless. **Przy cold start (bez aktywnych funkcji przez pewien czas) rate limit resetuje się całkowicie.** W środowisku rozproszonym (wiele instancji Vercel) każda ma własny licznik.

**Ryzyko:** Atakujący może ominąć rate limit, wysyłając żądania zaraz po cold start, lub rozkładając je na wiele instancji.

### 4.3 send-email.js — Brevo API
- Wysyła klucz API Brevo w nagłówku `api-key` — **to jest problem** jeśli logi Vercel przechwytują nagłówki (ale Brevo używa HTTPS, więc samo połączenie jest bezpieczne)
- Fallback: Brevo → Resend
- **Brak timeout** dla `fetch('https://api.brevo.com/v3/smtp/email')` — domyślny timeout fetch (przeglądarki: ~300s, Node.js: brak) — może zablokować Vercel function

### 4.4 imagekit-auth.js
- **Per-IP rate limit:** 5 żądań na 10 sekund — bardzo restrykcyjne, ale poprawne dla uploadów
- Token ważny 40 minut (< 1h zgodnie z ImageKit docs)
- Folder whitelist: profiles, rewear, tebtalk, articles, general
- Wymaga sesji (cookies-based auth)
- ⚠️ **Brak timeout dla żądań Supabase** w `getSessionFromCookies`

### 4.5 Znalezione problemy w API

❌ **signup.js zwraca createData.user w odpowiedzi** (linia 227) — wyciek danych użytkownika (w tym `id`, email)  
❌ **send-email.js nie ma timeout na Brevo API fetch** — Vercel function timeout (10s dla planu Hobby, 60s dla Pro) może zostać przekroczony  
❌ **imagekit-auth.js:** brak timeout dla `getSessionFromCookies()`  
❌ **Rate limiting in-memory:** nie działa poprawnie na Vercel (serverless, wiele instancji)  
❌ **Brak CSRF token:** `requireSameOrigin` chroni tylko przed atakami cross-site, ale nie CSRF z tej samej domeny (np. XSS)  
❌ **Brak Content-Type walidacji:** `readJsonBody` przyjmuje każdy Content-Type  
❌ **`send-email.js`: brak autoryzacji** — każdy, kto zna origin, może wysłać e-mail przez ten endpoint (chroniony tylko rate limitingiem i origin check)  

---

## 5. KLIENT (FRONTEND)

### 5.1 API Keys w bundle JS
- `VITE_SUPABASE_URL` — URL, ok
- `VITE_SUPABASE_ANON_KEY` — anon key, OK (to publiczny klucz)
- `VITE_IMAGEKIT_URL_ENDPOINT` — URL endpoint, OK
- `VITE_VAPID_PUBLIC_KEY` — publiczny klucz VAPID (jeśli ustawiony)
- **Brak service_role key w bundle** ✅ — nie znaleziono

### 5.2 CSP Headers (vercel.json) ✅
```
default-src 'self'
base-uri 'self'
object-src 'none'
frame-ancestors 'none'
form-action 'self'
img-src 'self' https://ik.imagekit.io blob: data:
script-src 'self'
style-src 'self' https://fonts.googleapis.com
style-src-attr 'unsafe-inline'  ⚠️
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://upload.imagekit.io https://ik.imagekit.io https://fonts.googleapis.com https://fonts.gstatic.com https://librus-proxy-production.up.railway.app
font-src 'self' https://fonts.gstatic.com data:
frame-src https://www.youtube.com https://www.youtube-nocookie.com
upgrade-insecure-requests
```

**Znalezione problemy:**
❌ **`style-src-attr 'unsafe-inline'`** — pozwala na inline style atrybutów, które mogą być używane do ataków CSS injection  
❌ **Brak `nonce` lub `strict-dynamic`** dla script-src — `script-src 'self'` może być ominięty przez JSONP/gadgety  
❌ **Brak `report-uri`/`report-to`** — CSP violation reporting nie jest skonfigurowane  

### 5.3 Niebezpieczne praktyki w frontend

❌ **`dangerouslySetInnerHTML` w Feed.jsx** (linia 784) — używa `sanitizeFeedHtml()` ale to nie jest DOMPurify; pozwala na `iframe` tylko z YouTube, ale **inne tagi HTML nie są sanitowane** — ryzyko XSS  
❌ **`wrapper.innerHTML` w Feed.jsx** (linia 215) — przypisanie innerHTML mimo wcześniejszego sanitizowania  
❌ **sessionStorage w TEBtalk.jsx** (brak walidacji schematu po JSON.parse) — ryzyko ataku przez przejęcie cache  
❌ **DEV mock session** (App.jsx linie 214-218, 226-230) — w trybie development, mockowana sesja z `id: 'local-test-user'` — może być ryzykowne, jeśli kod dev trafi do produkcji  
❌ **imageKitService.js** używa `import.meta.env.IMAGEKIT_URL_ENDPOINT` (bez prefiksu VITE_) — **to nie zadziała!** Vite tylko eksponuje zmienne z prefiksem `VITE_` do kodu klienta (linia 3)  

### 5.4 DOMPurify
✅ Używane do sanitizacji plain text i obrazków w `safeContent.js`  
⚠️ **ALE nie jest używane do sanitizacji HTML w Feed.jsx** — zamiast tego własna implementacja `sanitizeFeedHtml()`

### 5.5 Word filter (frontend)
✅ Działa w leetspeak  
❌ Używa `####` jako placeholder — niebezpieczne, jeśli ktoś wpisze `####` w treści (zostanie zastąpione ponownie przy ponownej sanitizacji)  

### 5.6 Service Worker
✅ Cache dla fontów (CacheFirst)  
✅ Cache dla obrazków (StaleWhileRevalidate)  
✅ Cache dla ImageKit (CacheFirst)  
✅ App shell (NetworkFirst, timeout 3s)  
✅ Bezpieczne API cache — tylko GET, nie `/api/auth/*` ani `/api/imagekit-auth` ani `/api/send-email`  
✅ Push notifications obsługa  
✅ Auto-update (`SKIP_WAITING`)  

---

## 6. INFRASTRUKTURA

### 6.1 Zmienne środowiskowe (z .env.example + README)

| Zmienna | Typ | Gdzie używana | W bundle? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | public | Frontend + API | TAK |
| `VITE_SUPABASE_ANON_KEY` | public | Frontend + API | TAK |
| `SUPABASE_SERVICE_ROLE_KEY` | SECRET | API (signup.js) | NIE |
| `SUPABASE_URL` | secret | API | NIE |
| `SUPABASE_ANON_KEY` | secret | API | NIE |
| `IMAGEKIT_PUBLIC_KEY` | public | API | NIE |
| `IMAGEKIT_PRIVATE_KEY` | SECRET | API | NIE |
| `IMAGEKIT_URL_ENDPOINT` | public | API + Frontend (build) | TAK |
| `VITE_IMAGEKIT_URL_ENDPOINT` | public | Frontend | TAK |
| `SMTP_HOST` | SECRET | API (signup.js) | NIE |
| `SMTP_PORT` | secret | API | NIE |
| `SMTP_USER` | SECRET | API | NIE |
| `SMTP_PASS` | SECRET | API | NIE |
| `SMTP_FROM` | secret | API | NIE |
| `BREVO_API_KEY` | SECRET | API | NIE |
| `BREVO_FROM` | secret | API | NIE |
| `RESEND_API_KEY` | SECRET | API | NIE |
| `RESEND_FROM` | secret | API | NIE |
| `EMAIL_PROVIDER` | public | API | NIE |
| `VITE_VAPID_PUBLIC_KEY` | public | Frontend | TAK (jeśli ustawiony) |
| `NODE_ENV` | env | API | NIE |

### 6.2 SMTP w kodzie
✅ `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` tylko w env, nie w kodzie  
✅ Połączenie SMTP z Cyber Folks (s68.cyber-folks.pl) — port 465 lub inny z TLS  

### 6.3 TLS/SSL
✅ `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`  
✅ `upgrade-insecure-requests` w CSP  

### 6.4 Logi
❌ **console.log/error w kodzie produkcyjnym:** znaleziono 69 wystąpień `console.log`/`console.error` w src/  
❌ **cleanupService.js:** loguje `'🚛 Śmieciarka wyjeżdża na sprzątanie...'`  
❌ **Wszystkie API endpointy logują emaile (maskowane), userId, błędy** — poprawne maskowanie emaili  

### 6.5 Nagłówki bezpieczeństwa (vercel.json)
| Nagłówek | Wartość | Ocena |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `X-Frame-Options` | `DENY` | ✅ |
| `X-Permitted-Cross-Domain-Policies` | `none` | ✅ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ |
| `Cross-Origin-Opener-Policy` | `same-origin` | ✅ |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | ✅ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ✅ |
| `Access-Control-Allow-Origin` | `https://teb-app-production.vercel.app` | ⚠️ statyczny |
| `Vary` | `Origin` | ✅ |
| `Content-Security-Policy` | (patrz sekcja 5.2) | ⚠️ |

---

## 7. ZALEŻNOŚCI

### 7.1 Package.json
| Pakiet | Wersja | Znane CVE? |
|---|---|---|
| `@supabase/supabase-js` | ^2.39.0 | Sprawdź — regularne aktualizacje |
| `browser-image-compression` | ^2.0.2 | Stabilny |
| `dompurify` | ^3.3.3 | ✅ Aktywnie utrzymywany |
| `lucide-react` | ^0.300.0 | Bezpieczny (ikony) |
| `nodemailer` | ^6.9.9 / ^8.0.9 | ⚠️ v8 jest stabilna, ale wymaga Node 18+ |
| `react` | ^18.2.0 | Stabilny |
| `react-quill` | ^2.0.0 | ⚠️ **NIEUTZYWANY OD 2021**, ma znane problemy bezpieczeństwa (XSS przez edytor) |
| `resend` | ^6.9.4 | Stabilny |
| `zustand` | ^4.5.0 | Stabilny |
| `vite` | ^5.0.8 | Stabilny |

### 7.2 Znalezione problemy
❌ **react-quill v2.0.0:** biblioteka nieaktualna od 2021 (brak wsparcia). Używa `dangerouslySetInnerHTML`. **Zalecana zamiana na nowy edytor** (np. TipTap, Plate)  
❌ **nodemailer v8.0.9 vs v6.9.9:** w package.json jest ^8.0.9, ale starsze wersje mogą być zainstalowane jako zależności pośrednie  
❌ **Brak `npm audit` w pipeline CI/CD** — nie sprawdzane regularnie  

---

## 8. NIEZAWODNOŚĆ

### 8.1 Timeouty

| Miejsce | Timeout | Uwagi |
|---|---|---|
| Frontend API calls (supabase.js) | 12s | ✅ AbortController |
| Frontend signup timeout (App.jsx) | 15s | ✅ Tylko wizualny |
| Frontend login timeout (App.jsx) | 15s | ✅ Tylko wizualny |
| SW app shell | 3s network timeout | ✅ |
| SW API cache | 2s network timeout | ✅ |
| SMTP nodemailer | **BRAK** | ❌ Domyślny timeout Node.js (może być 2 min+) |
| Brevo API fetch | **BRAK** | ❌ Domyślny timeout Node.js |
| Supabase API calls (getSessionFromCookies) | **BRAK** | ❌ |
| ImageKit upload | **BRAK** | ❌ Domyślny timeout |

### 8.2 Retry logic
✅ Frontend: retry na timeout loginu (3 próby, App.jsx)  
❌ **Brak retry dla API calls** (Brevo → Resend fallback, ale bez retry)  
❌ **Brak retry dla Supabase API calls**  

### 8.3 Error handling
✅ Wszystkie API endpointy mają `try/catch` z zwracaniem 500  
✅ Frontend: AppErrorBoundary dla błędów renderowania  
✅ Frontend: timeout errors tłumaczone na polski  
❌ **cleanupService.js:** wykonuje DELETE przez klienta (anon key) — **to NIE zadziała**, ponieważ RLS wymaga autoryzacji, a cleanup może być uruchomiony przez admina (Admin.jsx) z jego sesją. Działa tylko dla admina.  

### 8.4 Single Point of Failure
❌ **Supabase:** jeśli Supabase jest niedostępne, cała aplikacja przestaje działać — brak fallback  
❌ **SMTP Cyber Folks:** jeśli SMTP nie działa, rejestracja jest zablokowana (signup.js zwraca 503)  
❌ **Brevo API:** fallback na Resend — ale jeśli oba nie działają, email nie zostanie wysłany  
❌ **Vercel serverless:** timeout 10s (Hobby) — operacje email/SMTP mogą go przekroczyć  

### 8.5 Vercel Function Timeout (10s dla Hobby)
❌ SMTP email sending w signup.js może trwać >10s (zwłaszcza przy pierwszym połączeniu z Cyber Folks)  
❌ Brevo API fetch bez timeoutu może zablokować funkcję na długi czas  

### 8.6 Monitoring/Alerting
❌ **Brak** — Vercel logs są dostępne, ale nie ma dedykowanego monitoringu  
❌ **Brak Web Vitals**  
❌ **Brak error budget**  

---

## 9. ZALECENIA NAPRAWCZE

### KRYTYCZNE (P1) — natychmiast do naprawy

1. **🔴 signup.js zwraca createData.user** — usuń `user: createData.user` z odpowiedzi (linia 227). To wyciek ID użytkownika i potwierdza istnienie konta.

2. **🔴 Rate limiting in-memory nie działa na Vercel** — zastąp:
   - Użyj Supabase DB do rate limiting (tabela z IP/timestamp + czyszczenie)
   - Lub użyj Vercel Edge Config/KV Storage
   - Lub użyj podejścia opartego na Supabase Auth (max 5 failed attempts)
   
3. **🔴 Timeout na SMTP/Brevo fetch** — dodaj AbortController z timeoutem 8s do:
   - `createMailTransport().sendMail()` w signup.js
   - `fetch('https://api.brevo.com/v3/smtp/email')` w send-email.js
   - `getSessionFromCookies()` — Supabase auth API calls

4. **🔴 `dangerouslySetInnerHTML` w Feed.jsx** — zastąp DOMPurify.sanitize() na całym HTML przed wstrzyknięciem. Obecna `sanitizeFeedHtml()` nie chroni przed XSS w innych tagach HTML.

5. **🔴 send-email.js bez autoryzacji** — endpoint wymaga, by nadawca był zalogowany i miał odpowiednią rolę. Obecnie chroniony tylko origin check i rate limitingiem.

### WYSOKIE (P2) — w ciągu tygodnia

6. **🟠 CSP: `script-src` bez nonce** — dodaj nonce lub użyj `strict-dynamic`
7. **🟠 CSP: `style-src-attr 'unsafe-inline'`** — zastąp bezpieczniejszą polityką
8. **🟠 SameSite: Lax → Strict** dla `teb_refresh_token` (nie tylko `teb_access_token`)
9. **🟠 Duplikacja migracji** — usuń jeden z identycznych plików `20260327_init_schema.sql` / `20260327154621_init_schema.sql`
10. **🟠 `imageKitService.js`: `import.meta.env.IMAGEKIT_URL_ENDPOINT`** — zmień na `VITE_IMAGEKIT_URL_ENDPOINT` (bez prefiksu VITE_ nie działa w Vite)
11. **🟠 react-quill** — zastąp nowszym edytorem (TipTap, Plate, lub ReactQuill v2 beta)
12. **🟠 Ban check brak w istniejących konwersacjach DM** — dodaj `current_user_is_banned()` do `direct_messages_insert` dla wszystkich insertów
13. **🟠 `console.log` w produkcji** — usuń lub zamień na proper logging framework (prawie 70 wystąpień)

### ŚREDNIE (P3) — w ciągu miesiąca

14. **🟡 Web Vitals + monitoring** — dodaj Vercel Analytics, Sentry lub podobne
15. **🟡 Paginacja we wszystkich widokach list** — Feed, admin/Users, admin/Reports, TEBtalk, Groups
16. **🟡 Virtualization** — dla długich list (chat, feed, admin panel)
17. **🟡 Retry logic dla API calls** — dodaj exponential backoff
18. **🟡 Fallback offline** — jeśli Supabase niedostępny, pokaż ostatnio załadowane dane
19. **🟡 `NOT VALID` constraints** — uruchom walidację na istniejących danych (`VALIDATE CONSTRAINT`)
20. **🟡 Audyt zależności** — `npm audit` w CI/CD, regularne aktualizacje

### ARCHITEKTONICZNE (długoterminowe)

21. **⌛ Supabase jako SPOF** — rozważ buforowanie kluczowych danych (np. Redis/Upstash)
22. **⌛ Vercel KV do rate limiting** — zastąpi in-memory Map
23. **⌛ Server-side email queue** — kolejka zadań do wysyłki emaili zamiast synchronicznego SMTP

---

## PODSUMOWANIE

| Obszar | Status | Uwagi |
|---|---|---|
| Autentykacja | ⚠️ Dobrze zaprojektowana | Problem z rate limiting na Vercel, wyciek danych w signup |
| Autoryzacja (RBAC) | ✅ Bardzo dobra | RLS + triggery dają wielowarstwową ochronę |
| Supabase RLS | ✅ Wzorowe | Wszystkie tabele chronione, email ukryty, audit log |
| API Endpoints | ⚠️ Dobre | Brak timeoutów, rate limiting architektonicznie słaby |
| Frontend | ⚠️ Dobre | CSP do poprawy, XSS w Feed (niekrytyczny ale ryzykowny) |
| Infrastruktura | ⚠️ Poprawna | Brak monitoringu, statyczne CORS |
| Zależności | ⚠️ Stare biblioteki | react-quill nieaktualny |
| Niezawodność | ⚠️ Ograniczona | SPOF na Supabase/SMTP, brak timeoutów, brak retry |

**Ocena ogólna: 7/10** — aplikacja ma solidne podstawy bezpieczeństwa (RLS, walidacja, CSP, nagłówki), ale wymaga poprawek w obszarach: timeoutów, architektury rate limiting na Vercel, sanitizacji HTML, i monitoringu.
