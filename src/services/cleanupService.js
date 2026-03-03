import { supabase } from './supabase'

/**
 * Śmieciarka (Garbage Collector)
 * Automatyczne usuwanie starych danych zgodnie z polityką prywatności:
 * - Wiadomości prywatne i grupowe: 8 dni
 * - Przedmioty w Re-Wear: 21 dni
 * - Stare raporty: 30 dni
 */

export const CleanupService = {
    async runCleanup() {
        console.log("🚛 Śmieciarka wyjeżdża na sprzątanie...")

        const now = new Date()
        const chatThreshold = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
        const rewearThreshold = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString()
        const reportThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

        try {
            // 1. Usuwanie starych wiadomości bezpośrednich
            const { count: chatCount, error: chatErr } = await supabase
                .from('direct_messages')
                .delete({ count: 'exact' })
                .lt('created_at', chatThreshold)

            if (chatErr) console.error("Błąd czyszczenia czatu:", chatErr)

            // 2. Usuwanie starych wiadomości grupowych
            const { count: groupChatCount, error: groupChatErr } = await supabase
                .from('group_messages')
                .delete({ count: 'exact' })
                .lt('created_at', chatThreshold)

            if (groupChatErr) console.error("Błąd czyszczenia czatu grupowego:", groupChatErr)

            // 3. Usuwanie starych postów Re-Wear (w Twojej bazie tabela to rewear_posts)
            const { count: rewearCount, error: rewearErr } = await supabase
                .from('rewear_posts')
                .delete({ count: 'exact' })
                .lt('created_at', rewearThreshold)

            if (rewearErr) console.error("Błąd czyszczenia giełdy:", rewearErr)

            // 4. Usuwanie starych raportów
            const { count: reportCount, error: reportErr } = await supabase
                .from('reports')
                .delete({ count: 'exact' })
                .lt('created_at', reportThreshold)

            if (reportErr) console.error("Błąd czyszczenia raportów:", reportErr)

            console.log("✅ Sprzątanie zakończone.")
            return {
                success: true,
                deleted: {
                    chat: (chatCount || 0) + (groupChatCount || 0),
                    rewear: rewearCount || 0,
                    reports: reportCount || 0
                }
            }
        } catch (err) {
            console.error("Krytyczny błąd śmieciarki:", err)
            return { success: false, error: err.message }
        }
    }
}
