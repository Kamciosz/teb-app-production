import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
    // Inject ImageKit URL endpoint into the service worker at build time.
    // Set VITE_IMAGEKIT_URL_ENDPOINT (or IMAGEKIT_URL_ENDPOINT) in your environment before building.
    define: {
        'self.__IMAGEKIT_URL_ENDPOINT': JSON.stringify(process.env.VITE_IMAGEKIT_URL_ENDPOINT || process.env.IMAGEKIT_URL_ENDPOINT || ''),
    },
    plugins: [
        react(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
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
                display_override: ['window-controls-overlay', 'fullscreen', 'minimal-ui'],
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
    build: {
        cssCodeSplit: true,
        sourcemap: false,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: false,
                drop_debugger: true,
                unused: true,
                dead_code: true,
            },
        },
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // Vendor — React core
                    if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
                        return 'vendor-react';
                    }
                    // Router
                    if (id.includes('node_modules/react-router')) {
                        return 'vendor-router';
                    }
                    // Supabase
                    if (id.includes('node_modules/@supabase')) {
                        return 'vendor-supabase';
                    }
                    // Editor
                    if (id.includes('node_modules/react-quill') || id.includes('node_modules/quill')) {
                        return 'vendor-quill';
                    }
                    // Image tools
                    if (id.includes('node_modules/react-easy-crop') || id.includes('node_modules/browser-image-compression')) {
                        return 'vendor-image';
                    }
                    // Lucide (icons)
                    if (id.includes('node_modules/lucide-react')) {
                        return 'vendor-icons';
                    }
                    // Everything else in a single vendor chunk to minimize HTTP requests
                    if (id.includes('node_modules')) {
                        return 'vendor-other';
                    }
                },
            },
        },
    },
});
