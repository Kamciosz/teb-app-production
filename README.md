# TEBapp — Aplikacja Społecznościowa TEB Technikum Warszawa

## Konfiguracja

### Zmienne środowiskowe (`.env.local`)

```env
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # Potrzebne do rejestracji (bez emaila)

# ImageKit
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=
IMAGEKIT_URL_ENDPOINT=
VITE_IMAGEKIT_URL_ENDPOINT=

# Email (opcjonalnie)
EMAIL_PROVIDER=resend
RESEND_API_KEY=
RESEND_FROM=TEBapp <noreply@twojadomena.pl>
```

### Rejestracja – jak działa

1. Frontend → `/api/auth/signup` (email, hasło, imię)
2. Serwer tworzy konto w Supabase Auth przez **Admin API**
3. Konto jest **auto-potwierdzone** (`email_confirm: true`) – brak emaila weryfikacyjnego
4. Trigger `on_auth_user_created` tworzy profil w `public.profiles`
5. Użytkownik loguje się normalnie

### Uruchomienie lokalne

```bash
npm install
cp .env.example .env.local   # wypełnij danymi
npm run dev
```

### Deploy na Vercel

```bash
# Wymagane zmienne w Vercel Dashboard:
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# IMAGEKIT_*, RESEND_API_KEY, RESEND_FROM
npm run build
vercel --prod
```
