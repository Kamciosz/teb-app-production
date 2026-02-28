import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['logo.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
                name: 'TEB-App Warszawa',
                short_name: 'TEB-App',
                description: 'Szkolna aplikacja społecznościowa TEB Edukacja',
                theme_color: '#121212',
                background_color: '#121212',
                display: 'standalone',
                orientation: 'portrait',
                start_url: "/",
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ],
});
