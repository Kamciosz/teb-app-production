# AUDIT OPTIMIZATION + SECURITY (ALL MODULES)

Data: 2026-03-31
Cel: maksymalna wydajnosc i offline-first bez naruszania bezpieczenstwa danych uzytkownikow.

## Priorytety
- P1: krytyczne bezpieczenstwo / atakowalnosc
- P2: wydajnosc wysokiego wplywu i niezawodnosc
- P3: dlug techniczny i optymalizacje uzupelniajace

## Frontend: moduly i braki

### src/features/tebtalk/TEBtalk.jsx
- P1: brak twardej walidacji schematu cache po JSON.parse (sessionStorage).
- P2: brak paginacji starszych wiadomosci (load older).
- P2: brak virtualization listy wiadomosci przy duzych watkach.
- P2: brak metryki czasu synchronizacji (cache vs network).
- P3: brak adaptacyjnego limitu fetch dla slabszych urzadzen.

### src/features/rewear/ReWearInbox.jsx
- P2: ryzyko N+1 przy hydratacji rozmow i profili.
- P2: brak virtualization listy wiadomosci.
- P3: brak lokalnego stale-while-revalidate dla read-only rozmow.

### src/features/groups/Groups.jsx
- P2: brak pagination i virtualization dla historii grup.
- P3: brak lokalnego cache TTL dla szybkiego powrotu.

### src/features/feed/Feed.jsx
- P1: konfiguracja iframe sanitization wymaga dalszego utwardzenia whitelisty.
- P2: brak paginacji komentarzy.
- P2: brak memoizacji renderu elementow list przy duzej aktywnosci.

### src/features/rewear/ReWear.jsx
- P1: uprawnienia krytyczne musza byc zawsze wymuszone po stronie backend/RLS.
- P2: brak paginacji listy ofert.
- P3: metadata osadzone w description (kruchy format), brak osobnej struktury danych.

### src/features/librus/Librus.jsx
- P1: wymagany pelny wipe danych tymczasowych na unmount/logout.
- P2: brak timeout budget + kontrolowanego retry dla wolnych requestow.

### src/features/admin/Admin.jsx
- P2: potencjalnie nieograniczone listy (users/reports/appeals) bez pagination/range.
- P2: brak serwerowych agregacji dla ciezkich widokow.

### src/features/profile/*
- P2: czesc zapytan ranking/statystyki mozna zwinac do RPC.
- P3: brak krotkiego cache read-only dla paneli profilu.

## Frontend: uslugi i baza UI

### src/services/imageKitService.js
- P2: brak memo per URL w goracych listach (powtarzane obliczenia transformacji).

### src/services/supabase.js
- P2: brak telemetrii klienta (refresh latency, retries, fail-rate).

### src/services/wordFilter.js
- P3: wymagane testy wydajnosci pod duzym throughput.

### src/sw.js
- P2: brak per-modulowej polityki fallback read-only (Feed/TEBtalk/ReWear/Profile).
- P2: brak jawnej polityki odswiezania cache przy zmianie schematu danych.

## Backend/API: moduly i braki

### lib/serverAuth.js
- P1: wymagane limity payload i timeout guards.
- P1: walidacja origin/host musi byc odporna na edge-cases proxy/IPv6.
- P1: ochrona przed operowaniem na wygaslym access tokenie.

### api/auth/login.js
- P1: rate limiting brute-force.
- P2: audit log security events (bez wycieku danych wrazliwych).

### api/auth/reset-password.js
- P1: rate limiting spam/abuse.
- P1: walidacja redirectTo pod open-redirect hardening.

### api/auth/signup.js
- P2: stale cleanup dla in-memory rate-store.
- P2: polityka hasel i konsystentna odpowiedz bez enumeracji kont.

### api/auth/resend-confirmation.js
- P2: stale cleanup rate-store i telemetry abuse.

### api/send-email.js
- P1: rate limiting per IP i per recipient.
- P2: sanitization i policy dla html body.

### api/imagekit-auth.js
- P1: trusted IP extraction + cleanup rate-store.
- P2: krotsze token expiry, stale no-store i spojnosc folder validation.

## DB/Infra: braki

### supabase/migrations/*
- P1: brak czesci indeksow pod hot queries (chat/feed/admin).
- P2: miejscami N+1 query path mozna zastapic RPC/view.
- P1: polityki RLS musza pozostac source of truth dla uprawnien krytycznych.

### vercel.json
- P2: doprecyzowanie cache policy dla read-only endpointow (bez auth/session/token).

## Czego brakuje globalnie
- End-to-end strategy: pagination + virtualization + server aggregation.
- Security observability: audit trail + alerty na naduzycia auth.
- Performance observability: Web Vitals + API p95 + error budget.
- Formalna polityka danych lokalnych (TTL, invalidation, schema-check).

## Rozpoczety proces naprawczy (security-first)

### Phase 0 - DONE
- audyt frontend/backend/db
- klasyfikacja P1/P2/P3

### Phase 1 - STARTED
- hardening auth/API bez naruszania RLS i danych uzytkownika
- limity payload, rate limiting, redirect validation, origin checks

### Phase 2
- pagination i virtualization dla modulow chat/feed/admin/rewear

### Phase 3
- indeksy DB + RPC pod hot paths

### Phase 4
- offline quality: per-modul cache policy + schema validation lokalnych danych

## Zasady bezpieczenstwa (nie negocjowalne)
- brak cache dla auth/session/token endpointow
- brak oslabiania CSP/RLS/SameSite/HSTS
- kazda optymalizacja nie moze zwiekszac powierzchni ataku
- w konflikcie: bezpieczenstwo danych > szybkosc

## KPI do potwierdzenia po wdrozeniu
- p95 login/reset endpoint latency
- p95 fetch chat open latency
- liczba 429 na endpointach auth/email
- Web Vitals: LCP, INP, TTFB
- brak regresji RLS i brak wyciekow danych miedzy kontami
