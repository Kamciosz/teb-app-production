import React, { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown, X } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Feed() {
    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [newContent, setNewContent] = useState('')

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

    async function handleAddPost(e) {
        e.preventDefault()
        if (!newContent) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Wstawka przez Supabase API (Jeśli RLS zabroni - błąd redaktora wyrzuci info)
        const { error } = await supabase.from('feed_posts').insert([
            { author_id: session.user.id, content: newContent }
        ])

        if (error) {
            alert("Błąd: Prawdopodobnie nie masz jeszcze włączonych uprawnień Redaktora lub Administratora tablicy aby cokolwiek napisać!")
        } else {
            setIsModalOpen(false)
            setNewContent('')
            fetchPosts()
        }
    }

    async function handleUpvote(postId, currentVotes) {
        const { error } = await supabase.from('feed_posts').update({ upvotes: currentVotes + 1 }).eq('id', postId)
        if (!error) fetchPosts()
    }

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-primary">Główna Tablica</h2>
                <button onClick={() => setIsModalOpen(true)} className="bg-primary/20 text-primary px-4 py-2 rounded-full font-bold text-sm border border-primary/50 cursor-pointer transition active:scale-95">
                    + Wpis
                </button>
            </div>

            {loading ? (
                <div className="text-gray-500 text-center animate-pulse mt-10">Synchronizacja danych...</div>
            ) : (
                <div className="flex flex-col gap-4">
                    {posts.map(post => (
                        <div key={post.id} className="bg-surface rounded-2xl p-5 border border-gray-800 shadow-lg">
                            <div className="text-sm text-gray-400 mb-3">
                                <strong className="text-gray-200">{post.profiles?.full_name || 'Uczeń'}</strong> • {new Date(post.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-gray-100 mb-4 leading-relaxed">
                                {post.content}
                            </div>
                            <div className="flex gap-4 items-center">
                                <button onClick={() => handleUpvote(post.id, post.upvotes)} className="text-gray-500 hover:text-primary transition"><ArrowUp size={20} /></button>
                                <span className="font-bold text-primary">{post.upvotes - post.downvotes}</span>
                                <button className="text-gray-500 hover:text-secondary transition"><ArrowDown size={20} /></button>
                            </div>
                        </div>
                    ))}
                    {posts.length === 0 && <div className="text-center text-gray-500 mt-10">Brak postów. Bądź pierwszy!</div>}
                </div>
            )}

            {/* Modal dodawania Postu */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
                            <X size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-white mb-4">Utwórz Nowy Wpis</h3>
                        <form onSubmit={handleAddPost} className="flex flex-col gap-4">
                            <textarea
                                placeholder="Co chcesz przekazać społeczności? Pamiętaj o zasadach SU."
                                required
                                rows={4}
                                className="p-3 border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary resize-none"
                                value={newContent} onChange={e => setNewContent(e.target.value)}
                            />
                            <button type="submit" className="bg-primary text-white font-bold py-3 rounded-xl mt-2 transition active:scale-95 shadow-[0_0_10px_rgba(59,130,246,0.4)]">
                                Opublikuj na Tablicy
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
