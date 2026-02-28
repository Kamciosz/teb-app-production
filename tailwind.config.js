/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#00ff88',
                surface: '#1e1e1e',
                background: '#121212',
            }
        },
    },
    plugins: [],
}
