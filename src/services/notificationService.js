import { supabase } from './supabase';

export const NotificationService = {
    // Klucz VAPID (Publiczny) - prefer env var `VITE_VAPID_PUBLIC_KEY` injected at build time.
    // Jeśli nie dostarczono, pozostawiamy wartość domyślną (może być placeholderem).
    VAPID_PUBLIC_KEY: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY)
        ? import.meta.env.VITE_VAPID_PUBLIC_KEY
        : 'BJn_v0_4u5ZzX7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X',

    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('Ta przeglądarka nie obsługuje powiadomień.');
            return false;
        }

        const permission = await Notification.requestPermission();
        return permission === 'granted';
    },

    async subscribeUser(userId) {
        try {
            if (!('serviceWorker' in navigator)) return;

            const registration = await navigator.serviceWorker.ready;
            
            // Sprawdź czy już jest subskrypcja
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                // Prepare applicationServerKey (validate first)
                const keyArray = (() => {
                    try {
                        if (!this.VAPID_PUBLIC_KEY || /PLACEHOLDER|X{3,}/i.test(this.VAPID_PUBLIC_KEY)) return null;
                        return this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY);
                    } catch (err) {
                        console.warn('Invalid VAPID key, skipping push subscription:', err);
                        return null;
                    }
                })();

                if (!keyArray) {
                    console.warn('Push subscription skipped: invalid or missing VAPID public key.');
                } else {
                    // Subskrybuj
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: keyArray
                    });
                }
            }

            // Zapisz subskrypcję w Supabase
            const { error } = await supabase
                .from('push_subscriptions')
                .upsert({
                    user_id: userId,
                    subscription_json: subscription.toJSON()
                }, { onConflict: 'user_id' });

            if (error) throw error;
            console.log('Subskrypcja Push zarejestrowana pomyślnie.');
            return true;
        } catch (error) {
            console.error('Błąd subskrypcji Push:', error);
            return false;
        }
    },

    urlBase64ToUint8Array(base64String) {
        if (!base64String || typeof base64String !== 'string') throw new Error('Invalid base64 string');
        // Convert from base64url to base64 and normalize
        const cleaned = base64String.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        const padding = '='.repeat((4 - (cleaned.length % 4)) % 4);
        const base64 = cleaned + padding;

        try {
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        } catch (err) {
            throw new Error('Failed to decode VAPID key. Ensure it is a valid base64url string. ' + err.message);
        }
    }
};
