import React, { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Feed() {
    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchPosts()
    }, [])

    async function fetchPosts() {
        // Odpytywanie darmowej bazy o posty chronione zapytaniem RLS
        const { data, error } = await supabase
            .from('feed_posts')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })

        if (data) setPosts(data)
        setLoading(false)
    }

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-primary">Główna Tablica</h2>
                <button className="bg-primary/20 text-primary px-4 py-2 rounded-full font-bold text-sm border border-primary/50 cursor-pointer">
                    + Wpis
                </button>
            </div>

            {loading ? (
                <div className="text-gray-500 text-center animate-pulse">Synchronizacja danych...</div>
            ) : (
                posts.length === 0 ? (
                    <div className="text-gray-500 text-center p-8 bg-surface/50 rounded-2xl border border-gray-800">
                        Brak nowych postów od kółka Tech-Teb.
                    </div>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="bg-surface rounded-2xl p-5 mb-4 border border-gray-800 shadow-lg">
                            <div className="text-sm text-gray-400 mb-3">
                                <strong className="text-gray-200">{post.profiles?.full_name || 'Uczeń'}</strong> • {new Date(post.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-gray-100 mb-4 leading-relaxed">
                                {post.content}
                            </div>
                            <div className="flex gap-4 items-center">
                                <button className="text-gray-500 hover:text-primary transition"><ArrowUp size={20} /></button>
                                <span className="font-bold text-primary">{post.upvotes - post.downvotes}</span>
                                <button className="text-gray-500 hover:text-red-500 transition"><ArrowDown size={20} /></button>
                            </div>
                        </div>
                    ))
                )
            )}
        </div>
    )
}
