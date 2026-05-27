import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// --- PRECACHE (app shell — HTML, CSS, JS) ---
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// --- STATIC ASSETS (JS, CSS, fonts) — CacheFirst ---
// Once downloaded, never re-download unless revision changes.
registerRoute(
    ({ request }) => request.destination === 'style'
        || request.destination === 'script'
        || request.destination === 'font'
        || request.destination === 'worker',
    new CacheFirst({
        cacheName: 'static-assets',
        plugins: [
            new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 365 * 24 * 60 * 60 }),
            new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
    })
);

// --- DOCUMENTS (HTML) — NetworkFirst with long cache fallback ---
// Prefers fresh HTML from network, falls back to cache when offline.
registerRoute(
    ({ request }) => request.destination === 'document',
    new NetworkFirst({
        cacheName: 'documents',
        networkTimeoutSeconds: 4,
        plugins: [
            new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }),
            new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
    })
);

// --- NAVIGATION (app shell) — NetworkFirst with generous cache ---
// Same as documents, but explicitly catches SPA navigations.
registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({
        cacheName: 'app-shell',
        networkTimeoutSeconds: 4,
        plugins: [
            new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }),
            new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
    })
);

// --- IMAGES (png, jpg, webp, svg, gif) — CacheFirst ---
// Biggest data saver: each image is downloaded ONCE, then served from cache.
registerRoute(
    /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)(?:\?.*)?$/,
    new CacheFirst({
        cacheName: 'images',
        plugins: [
            new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 24 * 60 * 60 }),
            new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
    })
);

// --- IMAGEKIT — CacheFirst (aggressive) ---
const IMAGEKIT_URL_ENDPOINT = (self.__IMAGEKIT_URL_ENDPOINT || '').replace(/\/+$/, '');
if (IMAGEKIT_URL_ENDPOINT) {
    registerRoute(
        ({ url }) => url.href.startsWith(IMAGEKIT_URL_ENDPOINT),
        new CacheFirst({
            cacheName: 'imagekit-cache',
            plugins: [
                new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 24 * 60 * 60 }),
                new CacheableResponsePlugin({ statuses: [0, 200] })
            ]
        })
    );
}

// --- GOOGLE FONTS — CacheFirst ---
registerRoute(
    /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
    new CacheFirst({
        cacheName: 'google-fonts',
        plugins: [
            new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
            new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
    })
);

// --- SAFE API READS (GET /api/*) — NetworkFirst with smart caching ---
// Tries network first (fresh data), falls back to cache when offline.
registerRoute(
    ({ url, request }) => {
        if (request.method !== 'GET') return false;
        if (url.origin !== self.location.origin) return false;
        if (!url.pathname.startsWith('/api/')) return false;
        if (url.pathname.startsWith('/api/auth/')) return false;
        if (url.pathname === '/api/imagekit-auth') return false;
        if (url.pathname === '/api/send-email') return false;
        return true;
    },
    new NetworkFirst({
        cacheName: 'api-reads',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 }),
            new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
    })
);

// --- LIGHTWEIGHT ASSETS (JSON, configs) — StaleWhileRevalidate ---
registerRoute(
    ({ url }) => /\.(?:json|webmanifest)$/.test(url.pathname),
    new StaleWhileRevalidate({
        cacheName: 'light-assets',
        plugins: [
            new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 })
        ]
    })
);

// =============================================
// SERVICE WORKER LIFECYCLE
// =============================================

// On install: immediately become active (no waiting)
self.addEventListener('install', () => {
    self.skipWaiting();
});

// On activate: take control of all pages
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Handle SKIP_WAITING from page for manual updates
self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// =============================================
// PUSH NOTIFICATIONS
// =============================================

self.addEventListener('push', (event) => {
    let data = { title: 'TEB-App', body: 'Nowa wiadomość!' };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/pwa-192x192.png',
        badge: '/logo.svg',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' },
        actions: [{ action: 'open', title: 'Otwórz Aplikację' }]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) {
                const client = clientList.find(c => c.focused) || clientList[0];
                return client.focus();
            }
            return clients.openWindow(event.notification.data.url);
        })
    );
});
