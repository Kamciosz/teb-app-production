/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3b82f6', // Niebieski akcent (zamiast zielonego)
                secondary: '#ef4444', // Czerwony akcent
                surface: '#1e1e1e',
                background: '#121212',
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
