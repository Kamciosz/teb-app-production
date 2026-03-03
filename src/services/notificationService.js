import { supabase } from './supabase';

export const NotificationService = {
    // Klucz VAPID (Publiczny) - uczeń musi go wygenerować w Supabase lub własnym backendzie
    // Jeśli go nie ma, używamy placeholder'a
    VAPID_PUBLIC_KEY: 'BJn_v0_4u5ZzX7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X_X7fX5X',

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
                // Subskrybuj
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
                });
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
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
};
