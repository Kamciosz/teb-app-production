import React, { useEffect, useState } from 'react'
import { Award, TrendingUp, User, EyeOff } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function TebGabkiRanking() {
    const [ranking, setRanking] = useState([])
    const [myRank, setMyRank] = useState(null)
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState('top') // 'top' or 'around_me'

    useEffect(() => {
        fetchRanking()
    }, [])

    async function fetchRanking() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        
        // Pobierz Top 50 użytkowników, którzy nie są ukryci
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, teb_gabki, avatar_url, role, is_private')
            .eq('is_private', false)
            .order('teb_gabki', { ascending: false })
            .limit(50)

        if (data) {
            setRanking(data)
            if (session) {
                const myIdx = data.findIndex(u => u.id === session.user.id)
                if (myIdx !== -1) setMyRank(myIdx + 1)
                else {
                    // Jeśli mnie nie ma w top 50, pobierz moją pozycję osobno
                    const { count } = await supabase
                        .from('profiles')
                        .select('*', { count: 'exact', head: true })
                        .gt('teb_gabki', (await supabase.from('profiles').select('teb_gabki').eq('id', session.user.id).single()).data?.teb_gabki || 0)
                    setMyRank((count || 0) + 1)
                }
            }
        }
        setLoading(false)
    }

    if (loading) return <div className="animate-pulse bg-surface border border-gray-800 rounded-xl h-64"></div>

    return (
        <div className="bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-xl">
            <div className="bg-[#1a1a1a] p-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Award className="text-yellow-500" size={20} /> Ranking Bogactwa
                </h3>
                {myRank && (
                    <div className="bg-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-bold border border-primary/30">
                        TWOJA POZYCJA: #{myRank}
                    </div>
                )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-800/50">
                {ranking.map((user, index) => (
                    <div key={user.id} className={`p-4 flex items-center gap-4 transition ${index < 3 ? 'bg-yellow-500/5' : ''}`}>
                        <div className="w-6 text-center">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : <span className="text-gray-500 text-xs font-bold">{index + 1}</span>}
                        </div>
                        
                        <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex-shrink-0 overflow-hidden">
                            {user.avatar_url ? (
                                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-500"><User size={20} /></div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-white truncate flex items-center gap-2">
                                {user.full_name}
                                {user.role === 'admin' && <span className="text-[8px] bg-red-500/20 text-red-500 px-1 rounded uppercase">ADMIN</span>}
                            </div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1">
                                <TrendingUp size={10} className="text-green-500" /> Aktywny Uczeń
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-primary font-black text-sm">🪙 {user.teb_gabki || 0}</div>
                            <div className="text-[9px] text-gray-600 font-bold uppercase">TG</div>
                        </div>
                    </div>
                ))}

                {ranking.length === 0 && (
                    <div className="p-10 text-center flex flex-col items-center gap-3">
                        <EyeOff size={40} className="text-gray-800" />
                        <p className="text-gray-500 text-xs">Wszyscy uczniowie są obecnie anonimowi.<br/>Bądź pierwszym, który pokaże się w rankingu!</p>
                    </div>
                )}
            </div>
            
            <div className="p-3 bg-[#1a1a1a] border-t border-gray-800">
                <p className="text-[9px] text-gray-600 text-center uppercase font-bold tracking-widest">Możesz ukryć się w rankingu w ustawieniach profilu</p>
            </div>
        </div>
    )
