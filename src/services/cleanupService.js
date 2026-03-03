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
            // 1. Usuwanie starych wiadomości
            const { count: chatCount, error: chatErr } = await supabase
                .from('direct_messages')
                .delete({ count: 'exact' })
                .lt('created_at', chatThreshold)

            if (chatErr) console.error("Błąd czyszczenia czatu:", chatErr)
            else console.log(`🧹 Usunięto ${chatCount || 0} starych wiadomości.`)

            // 2. Usuwanie starych przedmiotów Re-Wear
            const { count: rewearCount, error: rewearErr } = await supabase
                .from('rewear_items')
                .delete({ count: 'exact' })
                .lt('created_at', rewearThreshold)

            if (rewearErr) console.error("Błąd czyszczenia giełdy:", rewearErr)
            else console.log(`🧹 Usunięto ${rewearCount || 0} nieaktualnych przedmiotów z giełdy.`)

            // 3. Usuwanie starych raportów
            const { count: reportCount, error: reportErr } = await supabase
                .from('reports')
                .delete({ count: 'exact' })
                .lt('created_at', reportThreshold)

            if (reportErr) console.error("Błąd czyszczenia raportów:", reportErr)
            else console.log(`🧹 Usunięto ${reportCount || 0} starych zgłoszeń.`)

            console.log("✅ Sprzątanie zakończone.")
            return { success: true, deleted: { chat: chatCount, rewear: rewearCount, reports: reportCount } }
        } catch (err) {
            console.error("Krytyczny błąd śmieciarki:", err)
            return { success: false, error: err.message }
        }
    }
}
