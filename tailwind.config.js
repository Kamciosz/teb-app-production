// ============================================================
//  KOLORY – zsynchronizowane z src/app.config.js → COLORS
//  Jeśli zmieniasz kolor tam, zmień też tutaj (i odwrotnie).
// ============================================================

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ── Główny kolor UI (przyciski, aktywne ikony, linki)
                primary:    '#006DAE',   // TEB niebieski (Liceum) – czytelny na czarnym tle

                // ── Kolor akcentów (alerty, badge, oznaczenia moderatora)
                accent:     '#C8102E',   // TEB czerwony (Technikum)

                // ── Stare aliasy – zostawione dla kompatybilności
                secondary:  '#C8102E',   // = accent

                // ── Tła
                surface:    '#1e1e1e',   // karty, pola formularzy
                background: '#121212',   // główne tło aplikacji
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
