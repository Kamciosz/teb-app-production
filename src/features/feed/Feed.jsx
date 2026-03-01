import React, { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown, X, Image as ImageIcon, Video, FileText } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import DOMPurify from 'dompurify'
import ReportButton from '../../components/ReportButton'

export default function Feed() {
    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)

    // Nowe stany formularza "Onet"
    const [articleTitle, setArticleTitle] = useState('')
    const [articleCategory, setArticleCategory] = useState('News')
    const [articleHtml, setArticleHtml] = useState('')

    useEffect(() => {
        fetchPosts()
    }, [])

    async function fetchPosts() {
        const { data, error } = await supabase
            .from('feed_posts')
            .select('*, profiles(full_name, role)')
            .order('created_at', { ascending: false })

        if (data) setPosts(data)
        setLoading(false)
    }

    async function handleAddPost(e) {
        e.preventDefault()
        if (!articleTitle || !articleHtml) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { error } = await supabase.from('feed_posts').insert([
            {
                author_id: session.user.id,
                title: articleTitle,
                content: articleHtml,
                category: articleCategory
            }
        ])

        if (error) {
            console.error(error)
            alert("Brak uprawnień. Zgłoś problem z tabelą 'feed_posts' zarządowi! (" + error.message + ")")
        } else {
            setIsModalOpen(false)
            setArticleTitle('')
            setArticleHtml('')
            fetchPosts()
        }
    }

    async function handleUpvote(postId, currentVotes) {
        const { error } = await supabase.from('feed_posts').update({ upvotes: currentVotes + 1 }).eq('id', postId)
        if (!error) fetchPosts()
    }

    const getPostData = (post) => {
        // Zgodność wsteczna z JSONem starych tabel oraz nową architekturą Supabase Beta-3.0
        if (post.title) return { title: post.title, html: post.content, category: post.category }
        try {
            return JSON.parse(post.content)
        } catch {
            return { title: "Wiadomość tekstowa", html: `<p>${post.content}</p>`, category: "Społeczność" }
        }
    }

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'image', 'video'],
            ['clean']
        ],
    };

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Wiadomości TEB</h2>
                    <div className="text-xs text-primary font-bold">Oficjalny Portal Szkolny</div>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-[0_0_15px_rgba(59,130,246,0.5)] transition active:scale-95 flex items-center gap-2">
                    <FileText size={18} /> Redaguj
                </button>
            </div>

            {loading ? (
                <div className="text-gray-500 text-center animate-pulse mt-10">Pobieranie najnowszych artykułów...</div>
            ) : (
                <div className="flex flex-col gap-6">
                    {posts.map(post => {
                        const parsed = getPostData(post)
                        const isAdmin = post.profiles?.role === 'admin'
                        return (
                            <article key={post.id} className="bg-surface rounded-2xl border border-gray-800 shadow-xl overflow-hidden flex flex-col">
                                {/* Opcjonalny nagłówek artykułu "w stylu Onet", np obrazek, ale na razie pasek kategorii */}
                                <div className="px-5 py-3 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
                                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${parsed.category === 'Pilne' ? 'bg-red-500/20 text-red-500' : 'bg-primary/20 text-primary'}`}>
                                        {parsed.category?.toUpperCase() || 'NEWS'}
                                    </span>
                                    <span className="text-xs text-gray-500">{new Date(post.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="p-5">
                                    <h3 className="text-xl font-bold text-white mb-2 leading-tight">{parsed.title}</h3>

                                    {/* Treść Rich Text (zabezpieczona XSS przez dompurify) */}
                                    <div
                                        className="text-gray-300 text-sm mb-6 leading-relaxed prose prose-invert max-w-none prose-img:rounded-xl prose-img:shadow-lg prose-headings:text-white"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsed.html) }}
                                    />

                                    <div className="flex justify-between items-center pt-4 border-t border-gray-800">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isAdmin ? 'bg-red-500/20 text-red-500 outline outline-1 outline-red-500/50' : 'bg-gray-800 text-gray-400'}`}>
                                                {post.profiles?.full_name ? post.profiles.full_name.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                            <div className="text-sm">
                                                <strong className="text-gray-200 block">{post.profiles?.full_name || 'Uczeń'}</strong>
                                                <span className="text-xs text-gray-500">{isAdmin ? 'Redakcja / Zarząd' : 'Autor Społeczności'}</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 items-center">
                                            <ReportButton entityType="feed_post" entityId={post.id} subtle={true} />
                                            <div className="flex gap-3 items-center bg-background rounded-full px-3 py-1">
                                                <button onClick={() => handleUpvote(post.id, post.upvotes)} className="text-gray-400 hover:text-primary transition flex items-center gap-1"><ArrowUp size={16} /></button>
                                                <span className="font-bold text-sm text-white">{post.upvotes - post.downvotes}</span>
                                                <button className="text-gray-400 hover:text-secondary transition flex items-center gap-1"><ArrowDown size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        )
                    })}
                    {posts.length === 0 && <div className="text-center text-gray-500 mt-10 p-8 border border-gray-800 border-dashed rounded-2xl">Brak aktywnych artykułów. Zostań pierwszym reporterem!</div>}
                </div>
            )}

            {/* Modal dodawania Artykułu (Rich Text) */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto pt-10 pb-20">
                    <div className="bg-surface border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl relative flex flex-col my-auto max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="text-primary" /> Redaktor Artykułu</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition p-1 bg-gray-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddPost} className="p-6 flex flex-col gap-5 overflow-y-auto">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Tytuł Artykułu (Nagłówek)*</label>
                                    <input
                                        type="text" required placeholder="np. Sukces naszej szkolnej drużyny IT!"
                                        className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary font-bold"
                                        value={articleTitle} onChange={e => setArticleTitle(e.target.value)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Kategoria</label>
                                    <select
                                        className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary appearance-none cursor-pointer"
                                        value={articleCategory} onChange={e => setArticleCategory(e.target.value)}
                                    >
                                        <option>News</option>
                                        <option>Wydarzenia</option>
                                        <option>E-Sport</option>
                                        <option>Społeczność</option>
                                        <option>Pilne</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Treść Publikacji (Możesz dodawać obrazy)*</label>
                                <div className="bg-white rounded-xl overflow-hidden text-black border-2 border-transparent focus-within:border-primary transition p-0">
                                    <ReactQuill theme="snow" value={articleHtml} onChange={setArticleHtml} modules={modules} className="h-48 sm:h-64" placeholder="Rozpocznij pisanie artykułu..." />
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white font-bold transition">Anuluj</button>
                                <button type="submit" className="bg-primary text-white font-bold px-8 py-2.5 rounded-xl transition active:scale-95 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                    Publikuj Artykuł
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
