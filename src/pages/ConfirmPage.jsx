import React, { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react'

export default function ConfirmPage() {
    const [status, setStatus] = useState('loading') // loading, success, error
    const [message, setMessage] = useState('')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const token = params.get('token')

        if (!token) {
            setStatus('error')
            setMessage('Brak tokenu weryfikacyjnego w adresie URL.')
            return
        }

        fetch(`/api/auth/confirm-signup?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    setStatus('success')
                    setMessage(data.message || 'Konto utworzone!')
                } else {
                    setStatus('error')
                    setMessage(data.error || 'Nie udało się aktywować konta.')
                }
            })
            .catch(() => {
                setStatus('error')
                setMessage('Błąd sieci. Spróbuj ponownie.')
            })
    }, [])

    return (
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center px-6 py-10">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <img src="/pwa-192x192.png" alt="TEB-App" className="w-20 h-20 rounded-3xl mb-4 shadow-lg" />
                    <h1 className="text-2xl font-bold text-white tracking-tight">TEB-App</h1>
                </div>

                <div className="bg-[#1e1e1e] border border-gray-800 rounded-2xl p-8 text-center">
                    {status === 'loading' && (
                        <>
                            <Loader2 size={48} className="animate-spin text-primary mx-auto mb-4" />
                            <p className="text-white font-bold">Aktywowanie konta...</p>
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={36} className="text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Konto aktywowane!</h2>
                            <p className="text-gray-400 text-sm mb-6">{message}</p>
                            <a
                                href="/"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold transition hover:opacity-90"
                            >
                                Przejdź do logowania <ArrowRight size={18} />
                            </a>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                                <XCircle size={36} className="text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Nie udało się</h2>
                            <p className="text-gray-400 text-sm mb-6">{message}</p>
                            <a
                                href="/"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold transition hover:opacity-90"
                            >
                                Wróć do logowania <ArrowRight size={18} />
                            </a>
                            <p className="text-xs text-gray-600 mt-4">Link wygasł? <a href="/" className="text-primary underline">Zarejestruj się ponownie</a></p>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
