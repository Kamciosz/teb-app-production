// ============================================================
//  GŁÓWNY PLIK KONFIGURACYJNY APLIKACJI TEB-App
//  Jedno miejsce do zmiany nazwy, wersji, logo i kolorów.
//  Zmiany tutaj są automatycznie widoczne w całej aplikacji.
// ============================================================

// ─── INFORMACJE O APLIKACJI ──────────────────────────────────
export const APP_NAME        = 'TEB-App'
export const APP_VERSION     = 'v0.3'
export const APP_SUBTITLE    = 'Portal szkolny · tylko @teb.edu.pl'

// ─── LOGO ────────────────────────────────────────────────────
// Ścieżki względem folderu /public  (nie trzeba pisać "public/")
export const LOGO_SMALL      = '/pwa-192x192.png'   // 192×192 – header, ekran ładowania
export const LOGO_LARGE      = '/pwa-512x512.png'   // 512×512 – ekran logowania

// ─── KOLORY BRAND TEB ─────────────────────────────────────────
//  Zmień tutaj → zmieni się wszędzie, ale tailwind.config.js
//  też musi być zsynchronizowany (sekcja niżej w tym pliku).
//
//  TEB LICEUM    – niebieski  #006DAE  (kolor główny UI)
//  TEB TECHNIKUM – czerwony   #C8102E  (akcenty, badge, alerty)
//
export const COLORS = {
    primary:    '#006DAE',   // TEB niebieski (główny – czytelny na czarnym)
    accent:     '#C8102E',   // TEB czerwony  (akcenty, oznaczenia)
    surface:    '#1e1e1e',   // kolor kart / pól
    background: '#121212',   // tło aplikacji
    textMuted:  '#6b7280',   // szary tekst pomocniczy
}

// ─── MOTYW (zsynchronizowany z tailwind.config.js) ───────────
//  Jeśli zmieniasz kolory powyżej, zmień też odpowiadające
//  wartości w tailwind.config.js → theme.extend.colors
//  (Tailwind nie może dynamicznie wczytywać JS w runtime).
//
//  tailwind.config.js  ←→  COLORS powyżej
//  primary             ←→  COLORS.primary
//  accent              ←→  COLORS.accent
//  surface             ←→  COLORS.surface
//  background          ←→  COLORS.background

// ─── SZYBKA ŚCIĄGAWKA: JAK ZMIENIAĆ KOLORY ───────────────────
//  1. Zmień wartość hex w COLORS powyżej (np. primary)
//  2. Zmień tę samą wartość w tailwind.config.js → colors.primary
//  3. Zapisz oba pliki → Vercel sam zbuduje nową wersję
//
//  Przykład zmiany głównego koloru na zielony:
//    primary: '#16a34a'   ← zmień tu
//    i primary: '#16a34a' ← i tu (tailwind.config.js)
