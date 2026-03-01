import React, { useState } from 'react'
import { AlertOctagon, X } from 'lucide-react'
import { supabase } from '../services/supabase'

export default function ReportButton({ entityType, entityId, subtle = false }) {
    const [isOpen, setIsOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    async function handleReport(e) {
        e.preventDefault()
        if (!reason || !entityType || !entityId) return
        setLoading(true)

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { error } = await supabase.from('reports').insert([{
            reporter_id: session.user.id,
            reported_entity_type: entityType,
            reported_entity_id: entityId,
            reason: reason,
            status: 'pending'
        }])

        setLoading(false)
        if (!error) {
            setSuccess(true)
            setTimeout(() => {
                setIsOpen(false)
                setSuccess(false)
                setReason('')
            }, 2000)
        } else {
            alert("Wystąpił błąd przy tworzeniu Zgłoszenia: " + error.message)
        }
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={`flex items-center justify-center transition ${subtle ? 'text-gray-600 hover:text-red-500 opacity-60 hover:opacity-100 p-1 bg-transparent' : 'bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-1.5 rounded-lg font-bold text-xs gap-1 opacity-80 hover:opacity-100 border border-red-500/20'}`}
                title="Zgłoś naruszenie"
            >
                <AlertOctagon size={subtle ? 14 : 16} />
                {!subtle && <span>Zgłoś</span>}
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-surface border border-red-500/30 w-full max-w-sm rounded-2xl shadow-2xl relative flex flex-col overflow-hidden fade-in relative">
                        {/* Czerwona poświata ostrzegawcza */}
                        <div className="absolute top-0 -inset-x-0 h-1/2 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none"></div>

                        <div className="px-5 py-4 flex justify-between items-center bg-[#1a1a1a] border-b border-gray-800 z-10">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <AlertOctagon className="text-red-500 text-shadow-red" size={20} />
                                Zgłoszenie Naruszenia
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition">
                                <X size={20} />
                            </button>
                        </div>

                        {success ? (
                            <div className="p-8 text-center flex flex-col items-center gap-3">
                                <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mb-2">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div className="text-lg font-bold text-white">Przyjęto Zgłoszenie</div>
                                <p className="text-xs text-gray-400">Moderatorzy SU wkrótce się tym zajmą. Dziękujemy za zgłoszenie.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleReport} className="p-6 flex flex-col gap-4 z-10">
                                <div>
                                    <label className="text-xs text-gray-400 font-bold mb-2 block">Dlaczego zgłaszasz ten wpis?</label>
                                    <select
                                        className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-red-500 appearance-none text-sm cursor-pointer"
                                        value={reason} onChange={e => setReason(e.target.value)} required
                                    >
                                        <option value="" disabled hidden>Wybierz powód...</option>
                                        <option value="spam">Spam i fałszywe treści</option>
                                        <option value="hate">Mowa nienawiści / Nękanie</option>
                                        <option value="scam">Oszustwo / Wyłudzenie</option>
                                        <option value="inappropriate">Nieodpowiednie treści (18+)</option>
                                        <option value="other">Inny powód (napisz obsłudze e-mail)</option>
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 bg-background p-3 rounded-xl border border-gray-800">
                                    Pamiętaj, by nie nadużywać tej funkcji. Zbyt wiele fałszywych ticketów grozi banem.
                                </p>
                                <div className="flex justify-end gap-3 mt-4">
                                    <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 rounded-xl text-gray-400 hover:text-white font-bold text-sm">Anuluj</button>
                                    <button type="submit" disabled={loading || !reason} className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.3)] transition active:scale-95 text-sm">
                                        {loading ? 'Wysyłanie...' : 'Wyślij Ticket'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
