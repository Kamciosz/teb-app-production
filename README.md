# TEB-APP PWA 🚀 *(Status: Beta-2.0 Unstable)*
Witaj w głównym repozytorium **TEB-App**, tworzonym przez zarząd SU z ramienia Kółka Tech-TEB dla wszystkich uczniów Technikum "TEB Edukacja" w Warszawie.

---

### Gdzie znaleźć pełną dokumnetację wdrożeniową dla PWA?
Dla pełnego wdrożenia architektonicznego, procedur deploymentu dla serwisu *Vercel* oraz *Supabase*, zerknij do głównego dokumentu Kółka Tech: **[Wdrożenie Systemu PWA.md](../../Wdrozenie_Systemu_PWA.md)**

---

### Szybki start dla Developerów Front-endu
Ten repzytoryjny katalog `teb-app-src` posiada już zainicjowaną strukturę **React (Vite) + Tailwind + Vite-PWA**, oraz posiada zdefiniowane w SQL surowe bazy danych Supabase (plik `/supabase/schema.sql`).

**Instalacja i Uruchomienie:**
1. Sklonuj projekt i wejdź do folderu `teb-app-src`.
2. Otwórz terminal i odpal komendę: `npm install`.
3. Skopiuj podane ci przez Admina parametry z Supabase URL i zrób z nich plik `.env` (przykład poniżej):
```env
VITE_SUPABASE_URL=twoj_url_supabase
VITE_SUPABASE_ANON_KEY=twoj_anon_key_supabase
```
4. Uruchom serwer developerski poleceniem: `npm run dev` i wejdź na `localhost:5173`.
5. Moduły (np. Vinted, Librus) twórz wyłącznie i dodawaj w nowym folderze `src/features/*`. Główny Routing znajdziesz do modyfikacji w `src/App.jsx`.
