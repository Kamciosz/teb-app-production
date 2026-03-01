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
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2,jpg,jpeg,webp}'],
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            },
                        }
                    },
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'images-cache',
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24 * 30
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'supabase-api-cache',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 // Cache supabase request for 1 day
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /.*/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'others-network-first-cache',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 2
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ],
                navigateFallback: '/index.html',
                navigateFallbackAllowlist: [/^\/$/]
            }
        })
    ]
});
