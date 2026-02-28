import React, { useEffect, useState } from 'react'
import { ShieldAlert, Search, UserMinus, UserCheck } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Admin() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        checkAccessAndFetch()
    }, [])

    async function checkAccessAndFetch() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Weryfikacja RLS: Czy ja na pewno jestem adminem?
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()

        if (profile?.role === 'admin') {
            setIsAdmin(true)
            const { data: allUsers } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
            if (allUsers) setUsers(allUsers)
        }
        setLoading(false)
    }

    if (loading) return <div className="text-center text-primary mt-10">Autoryzacja SU...</div>

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center mt-20 text-center">
                <ShieldAlert size={60} className="text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-red-500 mb-2">Brak Dostępu</h2>
                <p className="text-gray-400">Ten panel jest ściśle strzeżony. Tylko dla członków zarządu Tech-TEB.</p>
            </div>
        )
    }

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-red-500">Panel Zarządu</h2>
                    <span className="text-xs text-gray-400">Moderacja PWA ({users.length} użytkowników)</span>
                </div>
                <ShieldAlert className="text-red-500" size={28} />
            </div>

            <div className="flex bg-surface border border-gray-800 rounded-xl p-2 mb-6">
                <input type="text" placeholder="Szukaj ucznia..." className="bg-transparent text-white pl-2 outline-none w-full" />
                <button className="p-2 text-gray-400"><Search size={20} /></button>
            </div>

            <div className="flex flex-col gap-3">
                {users.map(u => (
                    <div key={u.id} className="bg-surface border border-gray-800 p-4 rounded-xl flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="font-bold text-white">{u.full_name}</div>
                                <div className="text-xs text-gray-500">{u.email}</div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-bold ${u.role === 'admin' ? 'bg-red-500/20 text-red-400' : u.role === 'editor' ? 'bg-orange-500/20 text-orange-400' : 'bg-primary/20 text-primary'}`}>
                                {u.role.toUpperCase()}
                            </span>
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button className="flex-1 bg-surface border border-primary text-primary py-2 rounded-lg text-xs font-bold hover:bg-primary/10 transition flex justify-center items-center gap-2">
                                <UserCheck size={14} /> Dziennikarz
                            </button>
                            <button className="flex-1 bg-surface border border-red-500 text-red-500 py-2 rounded-lg text-xs font-bold hover:bg-red-500/10 transition flex justify-center items-center gap-2">
                                <UserMinus size={14} /> Zbanuj
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
