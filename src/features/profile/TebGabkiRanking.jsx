import React, { useEffect, useState } from 'react'
import { Trophy, User, ArrowRight } from 'lucide-react'
import { supabase } from '../../services/supabase'
import { ImageKitService } from '../../services/imageKitService'

export default function TebGabkiRanking() {
    const [ranking, setRanking] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchRanking()
    }, [])

    async function fetchRanking() {
        // Pobieramy top 10 profili, które nie są prywatne
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, teb_gabki, avatar_url, role')
            .eq('is_private', false)
            .order('teb_gabki', { ascending: false })
            .limit(10)

        if (!error && data) {
            setRanking(data)
        }
        setLoading(false)
    }

    if (loading) return <div className="animate-pulse flex flex-col gap-2 mt-4"><div className="h-20 bg-gray-800 rounded-xl w-full"></div></div>

    return (
        <div className="mt-8 fade-in">
            <div className="flex items-center gap-2 mb-4 px-2">
                <Trophy className="text-yellow-500" size={20} />
                <h3 className="font-bold text-lg text-white">Ranking TebGąbek</h3>
            </div>

            <div className="bg-surface border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                {ranking.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm italic">
                        Brak publicznych milionerów w tej chwili.
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {ranking.map((user, index) => (
                            <div
                                key={user.id}
                                className={`flex items-center gap-4 p-4 border-b border-gray-800/50 last:border-0 hover:bg-white/5 transition cursor-pointer group`}
                            >
                                <div className="w-8 flex justify-center items-center">
                                    {index === 0 ? (
                                        <div className="w-6 h-6 rounded-full bg-yellow-500 text-black flex items-center justify-center font-bold text-[10px] shadow-[0_0_10px_rgba(234,179,8,0.5)]">1</div>
                                    ) : index === 1 ? (
                                        <div className="w-6 h-6 rounded-full bg-gray-300 text-black flex items-center justify-center font-bold text-[10px] shadow-[0_0_10px_rgba(209,213,219,0.5)]">2</div>
                                    ) : index === 2 ? (
                                        <div className="w-6 h-6 rounded-full bg-amber-600 text-black flex items-center justify-center font-bold text-[10px] shadow-[0_0_10px_rgba(217,119,6,0.5)]">3</div>
                                    ) : (
                                        <span className="text-gray-500 font-bold text-xs">{index + 1}</span>
                                    )}
                                </div>

                                <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-gray-700 overflow-hidden shrink-0">
                                    {user.avatar_url ? (
                                        <img
                                            src={ImageKitService.getOptimizedUrl(user.avatar_url, 100)}
                                            alt="Av"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500 uppercase font-bold text-sm">
                                            {user.full_name.charAt(0)}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                                        {user.full_name}
                                        {user.role === 'admin' && <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_5px_red]"></div>}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{user.role}</div>
                                </div>

                                <div className="text-right">
                                    <div className="text-yellow-500 font-bold text-sm">🪙 {user.teb_gabki || 0}</div>
                                    <div className="text-[8px] text-gray-600 font-bold uppercase">Reputacja</div>
                                </div>

                                <ArrowRight size={14} className="text-gray-800 group-hover:text-primary transition -ml-2 group-hover:ml-0 opacity-0 group-hover:opacity-100" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p className="text-[10px] text-gray-600 mt-4 px-2 text-center">
                Ranking odświeżany w czasie rzeczywistym. <br />
                Tylko profile oznaczone jako publiczne są tutaj widoczne.
            </p>
        </div>
    )
}
