import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './pwaInstallPrompt.js'

// --- Auto-update Service Worker ---
// Runs on EVERY load, even cached. Detects waiting SW and activates it.
(async function autoUpdateSW() {
    try {
        if (!('serviceWorker' in navigator)) return;

        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;

        // If a new SW is already waiting, activate it NOW
        if (reg.waiting) {
            console.log('[SW] New version waiting — activating immediately');
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            // Reload after short delay to let activation complete
            setTimeout(() => window.location.reload(), 300);
            return;
        }

        // Listen for future updates — auto-activate when detected
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[SW] New version installed — activating');
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    setTimeout(() => window.location.reload(), 300);
                }
            });
        });
    } catch (e) {
        console.warn('[SW] Auto-update error:', e);
    }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
