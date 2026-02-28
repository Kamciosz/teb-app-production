import React, { useEffect, useState } from 'react'
import { User, LogOut, Settings, Award, Heart } from 'lucide-react'
import { supabase, signOut } from '../../services/supabase'

export default function Profile() {
    const [profile, setProfile] = useState(null)

    useEffect(() => {
        loadProfile()
    }, [])

    async function loadProfile() {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
            if (data) {
                setProfile({ ...data, email: session.user.email })
            } else {
                setProfile({ full_name: 'Brak Imienia w Bazie', email: session.user.email, role: 'student', reputation: 0 })
            }
        }
    }

    if (!profile) return <div className="text-center mt-10 text-gray-400">Ładowanie Profilu...</div>

    return (
        <div className="pb-10 pt-2">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-primary">Twój Profil</h2>
                <button onClick={signOut} className="text-gray-500 hover:text-secondary"><LogOut size={24} /></button>
            </div>

            <div className="bg-surface border border-gray-800 relative p-6 rounded-xl flex flex-col items-center mb-6 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-secondary"></div>
                <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-4 border-4 border-background shadow-lg">
                    <User size={40} className="text-gray-500" />
                </div>
                <h3 className="font-bold text-xl text-white">{profile.full_name}</h3>
                <p className="text-sm text-gray-400 mb-2">{profile.email}</p>
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${(profile.role || 'student') === 'admin' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
                    Rola: {(profile.role || 'student').toUpperCase()}
                </span>
            </div>

            <h4 className="font-bold text-gray-300 mb-3 ml-2">Statystyki Społeczności</h4>
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between">
                    <div className="text-gray-400 font-bold text-sm">Punkty Reputacji</div>
                    <div className="text-xl font-bold text-primary flex items-center gap-1"><Award size={20} /> {profile.reputation || 0}</div>
                </div>
                <div className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between">
                    <div className="text-gray-400 font-bold text-sm">Polubienia (Otrzymane)</div>
                    <div className="text-xl font-bold text-secondary flex items-center gap-1"><Heart size={20} /> 0</div>
                </div>
            </div>
        </div>
    )
}
