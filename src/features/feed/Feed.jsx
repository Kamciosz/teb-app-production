import React, { useEffect, useState, useRef } from 'react'
import { ArrowUp, ArrowDown, X, Image as ImageIcon, Video, FileText, Maximize2, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import DOMPurify from 'dompurify'
import ReportButton from '../../components/ReportButton'
import { ImageKitService } from '../../services/imageKitService'
import imageCompression from 'browser-image-compression'
import { WordFilter } from '../../services/wordFilter'

export default function Feed() {
    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedPost, setSelectedPost] = useState(null)
    const [myRole, setMyRole] = useState('student')
    const [myId, setMyId] = useState(null)
    const quillRef = useRef(null)

    // Komentarze
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [commentsLoading, setCommentsLoading] = useState(false)

    // Nowe stany formularza "Onet"
    const [articleTitle, setArticleTitle] = useState('')
    const [articleCategory, setArticleCategory] = useState('News')
    const [articleHtml, setArticleHtml] = useState('')

    useEffect(() => {
        checkUser()
        fetchPosts()
    }, [])

    async function checkUser() {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            setMyId(session.user.id)
            const { data } = await supabase.from('profiles').select('role, roles').eq('id', session.user.id).single()
            if (data) {
                // Kompatybilność wsteczna: jeśli roles jest puste, używamy starego role
                const effectiveRoles = data.roles || (data.role ? [data.role] : ['student'])
                setMyRole(effectiveRoles[0] || 'student')
            }
        }
    }

    async function fetchComments(postId) {
        setCommentsLoading(true)
        const { data, error } = await supabase
            .from('feed_comments')
            .select('*, profiles(full_name, role)')
            .eq('post_id', postId)
            .order('created_at', { ascending: true })
        
        if (data) setComments(data)
        setCommentsLoading(false)
    }

    async function handleAddComment(e) {
        e.preventDefault()
        if (!newComment.trim() || !selectedPost || !myId) return

        const cleanedComment = WordFilter.clean(newComment.trim())
        
        const { data, error } = await supabase
            .from('feed_comments')
            .insert([{
                post_id: selectedPost.id,
                author_id: myId,
                content: cleanedComment
            }])
            .select('*, profiles(full_name, role)')
            .single()

        if (data) {
            setComments(prev => [...prev, data])
            setNewComment('')
            // Przyznaj 1 TG za komentarz
            const { data: profile } = await supabase.from('profiles').select('teb_gabki').eq('id', myId).single()
            if (profile) {
                await supabase.from('profiles').update({ teb_gabki: (profile.teb_gabki || 0) + 1 }).eq('id', myId)
            }
        }
    }

    const openPost = (post) => {
        setSelectedPost(post)
        fetchComments(post.id)
    }

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
                title: WordFilter.clean(articleTitle),
                content: WordFilter.clean(articleHtml),
                category: articleCategory
            }
        ])

        if (error) {
            console.error(error)
            alert("Błąd publikacji: " + error.message)
        } else {
            // Nagroda 15 TG za artykuł
            const { data: profile } = await supabase.from('profiles').select('teb_gabki').eq('id', session.user.id).single()
            if (profile) {
                await supabase.from('profiles').update({ teb_gabki: profile.teb_gabki + 15 }).eq('id', session.user.id)
            }
            setIsModalOpen(false)
            setArticleTitle('')
            setArticleHtml('')
            fetchPosts()
        }
    }

    async function handleVote(postId, voteType) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            alert("Zaloguj się, aby głosować!")
            return
        }

        const { data: existingVote } = await supabase
            .from('feed_votes')
            .select('vote_type')
            .eq('post_id', postId)
            .eq('user_id', session.user.id)
            .single()

        if (existingVote && existingVote.vote_type === voteType) {
            const { error } = await supabase
                .from('feed_votes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', session.user.id)
            if (!error) fetchPosts()
        } else {
            const { error } = await supabase
                .from('feed_votes')
                .upsert({
                    post_id: postId,
                    user_id: session.user.id,
                    vote_type: voteType
                }, { onConflict: 'post_id,user_id' })

            if (error) {
                console.error("Błąd głosowania:", error)
                alert("Nie udało się oddać głosu: " + error.message)
            } else {
                fetchPosts()
            }
        }
    }

    const imageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            try {
                // Kompresja przed CDN (Pracuj mądrze!)
                const options = {
                    maxSizeMB: 0.3,
                    maxWidthOrHeight: 1000,
                    useWebWorker: true,
                    fileType: 'image/webp'
                }
                const compressedFile = await imageCompression(file, options);

                const fileName = `feed_${Date.now()}.webp`;
                const url = await ImageKitService.upload(compressedFile, fileName, 'articles');

                const quill = quillRef.current.getEditor();
                const range = quill.getSelection(true);
                quill.insertEmbed(range.index, 'image', url);
            } catch (err) {
                console.error("Quill Upload Error:", err);
                alert("Błąd wgrywania zdjęcia.");
            }
        };
    };

    const modules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
            }
        }
    };

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Wiadomości TEB</h2>
                    <div className="text-xs text-primary font-bold">Oficjalny Portal Szkolny</div>
                </div>
                {(myRole === 'admin' || myRole === 'editor' || myRole === 'moderator_content') && (
                    <button onClick={() => setIsModalOpen(true)} className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-[0_0_15px_rgba(59,130,246,0.5)] transition active:scale-95 flex items-center gap-2">
                        <FileText size={18} /> Redaguj
                    </button>
                )}
            </div>

            {loading ? (
                <div className="text-gray-500 text-center animate-pulse mt-10">Pobieranie najnowszych artykułów...</div>
            ) : (
                <div className="flex flex-col gap-6">
                    {posts.map(post => {
                        const isAdmin = post.profiles?.role === 'admin'
                        // Wyciąganie pierwszego obrazka jako miniatura (Opcjonalnie)
                        const firstImgMatch = post.content?.match(/<img[^>]+src="([^">]+)"/);
                        const firstImg = firstImgMatch ? firstImgMatch[1] : null;

                        return (
                            <article key={post.id} className="bg-surface rounded-2xl border border-gray-800 shadow-xl overflow-hidden flex flex-col transition hover:border-gray-700">
                                <div className="px-5 py-3 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
                                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${post.category === 'Pilne' ? 'bg-red-500/20 text-red-500' : 'bg-primary/20 text-primary'}`}>
                                        {post.category?.toUpperCase() || 'NEWS'}
                                    </span>
                                    <span className="text-xs text-gray-500">{new Date(post.created_at).toLocaleDateString()}</span>
                                </div>

                                {firstImg && (
                                    <div className="h-40 overflow-hidden relative group cursor-pointer" onClick={() => openPost(post)}>
                                        <img src={firstImg} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                            <Maximize2 className="text-white" size={32} />
                                        </div>
                                    </div>
                                )}

                                <div className="p-5">
                                    <h3 onClick={() => openPost(post)} className="text-xl font-bold text-white mb-2 leading-tight cursor-pointer hover:text-primary transition">{post.title}</h3>

                                    <div
                                        className="text-gray-400 text-sm mb-6 line-clamp-3 leading-relaxed cursor-pointer"
                                        onClick={() => openPost(post)}
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content.split(' ').slice(0, 30).join(' ') + '...') }}
                                    />

                                    <div className="flex justify-between items-center pt-4 border-t border-gray-800">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isAdmin ? 'bg-red-500/20 text-red-500 outline outline-1 outline-red-500/50' : 'bg-gray-800 text-gray-400'}`}>
                                                {post.profiles?.full_name ? post.profiles.full_name.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                            <div className="text-sm">
                                                <strong className="text-gray-200 block">{post.profiles?.full_name || 'Uczeń'}</strong>
                                                <span className="text-xs text-gray-500">{isAdmin ? 'Redakcja' : 'Autor'}</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 items-center">
                                            <button onClick={() => openPost(post)} className="text-gray-500 hover:text-white transition flex items-center gap-1">
                                                <MessageCircle size={16} />
                                                <span className="text-xs font-bold">{post.comment_count || 0}</span>
                                            </button>
                                            <div className="flex gap-3 items-center bg-background rounded-full px-3 py-1">
                                                <button onClick={() => handleVote(post.id, 'up')} className="text-gray-400 hover:text-green-500 transition flex items-center gap-1 active:scale-125"><ArrowUp size={16} /></button>
                                                <span className={`font-bold text-sm ${((post.upvotes || 0) - (post.downvotes || 0)) > 0 ? 'text-green-500' : ((post.upvotes || 0) - (post.downvotes || 0)) < 0 ? 'text-red-500' : 'text-white'}`}>
                                                    {(post.upvotes || 0) - (post.downvotes || 0)}
                                                </span>
                                                <button onClick={() => handleVote(post.id, 'down')} className="text-gray-400 hover:text-red-500 transition flex items-center gap-1 active:scale-125"><ArrowDown size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        )
                    })}
                    {posts.length === 0 && <div className="text-center text-gray-500 mt-10 p-8 border border-gray-800 border-dashed rounded-2xl">Brak aktywnych artykułów.</div>}
                </div>
            )}

            {/* Modal Pełnego Artykułu */}
            {selectedPost && (
                <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col overflow-y-auto pt-10 px-4 md:px-10 animate-fade-in">
                    <button onClick={() => setSelectedPost(null)} className="fixed top-4 right-4 bg-surface p-2 rounded-full text-white z-[70] shadow-xl border border-gray-700">
                        <X size={24} />
                    </button>
                    <div className="w-full max-w-3xl mx-auto pb-20">
                        <span className="text-primary font-bold text-sm uppercase tracking-widest block mb-2">{selectedPost.category}</span>
                        <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">{selectedPost.title}</h1>
                        <div className="flex items-center gap-4 mb-10 pb-6 border-b border-gray-800">
                            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">{selectedPost.profiles?.full_name?.charAt(0)}</div>
                            <div>
                                <div className="text-white font-bold">{selectedPost.profiles?.full_name}</div>
                                <div className="text-gray-500 text-xs">{new Date(selectedPost.created_at).toLocaleString()}</div>
                            </div>
                        </div>
                        <div
                                className="text-gray-300 text-lg leading-relaxed prose prose-invert max-w-none 
                                         prose-img:rounded-3xl prose-img:shadow-2xl prose-img:w-full prose-img:mt-10 mb-10
                                         prose-a:text-primary prose-a:font-bold
                                         prose-p:mb-4 prose-li:mb-2"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedPost.content, {
                                    ADD_TAGS: ['iframe'],
                                    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
                                }).replace(/<iframe/g, '<div class="aspect-video w-full my-6 rounded-2xl overflow-hidden shadow-2xl"><iframe class="w-full h-full"').replace(/<\/iframe>/g, '</iframe></div>') }}
                            />

                        {/* Sekcja Komentarzy */}
                        <div className="mt-10 border-t border-gray-800 pt-8">
                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                <MessageCircle className="text-primary" /> Komentarze ({comments.length})
                            </h3>

                            {/* Formularz dodawania */}
                            {myId && (
                                <form onSubmit={handleAddComment} className="mb-8 flex gap-3">
                                    <input
                                        type="text"
                                        placeholder="Napisz co o tym sądzisz..."
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                        className="flex-1 bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-primary text-sm"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newComment.trim()}
                                        className="bg-primary text-white p-3 rounded-xl hover:bg-primary-dark transition disabled:opacity-50"
                                    >
                                        <Send size={20} />
                                    </button>
                                </form>
                            )}

                            {/* Lista komentarzy */}
                            <div className="space-y-4">
                                {commentsLoading ? (
                                    <div className="text-center text-gray-500 animate-pulse">Ładowanie komentarzy...</div>
                                ) : comments.length === 0 ? (
                                    <div className="text-center text-gray-500 text-sm py-4">Brak komentarzy. Bądź pierwszy!</div>
                                ) : (
                                    comments.map(comment => (
                                        <div key={comment.id} className="bg-[#1a1a1a] p-4 rounded-2xl border border-gray-800 flex flex-col gap-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                                        {comment.profiles?.full_name?.charAt(0)}
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-200">{comment.profiles?.full_name}</span>
                                                    {comment.profiles?.role === 'admin' && (
                                                        <span className="text-[8px] bg-red-500/20 text-red-500 px-1 rounded font-bold uppercase">ADMIN</span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-600">{new Date(comment.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-sm text-gray-400 leading-relaxed">{comment.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal dodawania Artykułu */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="text-primary" /> Redaktor</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition p-1 bg-gray-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddPost} className="p-6 flex flex-col gap-5 overflow-y-auto">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Tytuł*</label>
                                    <input
                                        type="text" required placeholder="Nagłówek..."
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
                                        <option>Pilne</option>
                                        <option>Sport</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Treść (Użyj ikony zdjęcia dla CDN)*</label>
                                <div className="bg-white rounded-xl overflow-hidden text-black border-2 border-transparent focus-within:border-primary transition p-0">
                                    <ReactQuill ref={quillRef} theme="snow" value={articleHtml} onChange={setArticleHtml} modules={modules} className="h-64" placeholder="Opisz temat..." />
                                </div>
                            </div>
                            <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white font-bold transition">Anuluj</button>
                                <button type="submit" className="bg-primary text-white font-bold px-8 py-2.5 rounded-xl transition active:scale-95 shadow-lg">Publikuj</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
