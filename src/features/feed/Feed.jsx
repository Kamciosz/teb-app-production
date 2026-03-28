import React, { useEffect, useState, useRef, useMemo } from 'react'
import { ArrowUp, ArrowDown, X, FileText, Maximize2, MessageCircle, Send, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import DOMPurify from 'dompurify'
import ReportButton from '../../components/ReportButton'
import { ImageKitService } from '../../services/imageKitService'
import { useToast } from '../../context/ToastContext'
import imageCompression from 'browser-image-compression'
import { WordFilter } from '../../services/wordFilter'

export default function Feed() {
    const MAX_ARTICLE_TITLE = 200
    const MAX_ARTICLE_HTML = 12000
    const MAX_COMMENT_LEN = 2000

    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedPost, setSelectedPost] = useState(null)
    const [myRoles, setMyRoles] = useState(['student'])
    const [myId, setMyId] = useState(null)
    const quillRef = useRef(null)
    const [editingPostId, setEditingPostId] = useState(null)

    // Komentarze
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [editingCommentId, setEditingCommentId] = useState(null)
    const [editingCommentText, setEditingCommentText] = useState('')
    const [commentActionBusyId, setCommentActionBusyId] = useState(null)

    // Nowe stany formularza "Onet"
    const [articleTitle, setArticleTitle] = useState('')
    const [articleCategory, setArticleCategory] = useState('News')
    const [articleHtml, setArticleHtml] = useState('')

    useEffect(() => {
        checkUser()
        fetchPosts()
    }, [])

    const canModerateContent = useMemo(
        () => myRoles.some(r => ['moderator_content', 'admin'].includes(r)),
        [myRoles]
    )

    const canPublish = useMemo(
        () => myRoles.some(r => ['admin', 'editor', 'redaktor', 'moderator_content'].includes(r)),
        [myRoles]
    )

    const toast = useToast();

    function createYouTubeEmbed(videoId) {
        return `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
    }

    function extractYouTubeVideoId(rawUrl) {
        if (!rawUrl) return null
        try {
            const withProtocol = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
            const url = new URL(withProtocol)
            const host = url.hostname.toLowerCase().replace(/^www\./, '')

            if (host === 'youtu.be') {
                const id = url.pathname.replace('/', '').split('/')[0]
                return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
            }

            if (host === 'youtube.com' || host === 'm.youtube.com') {
                if (url.pathname === '/watch') {
                    const id = url.searchParams.get('v')
                    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null
                }
                if (url.pathname.startsWith('/shorts/')) {
                    const id = url.pathname.split('/')[2]
                    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null
                }
                if (url.pathname.startsWith('/embed/')) {
                    const id = url.pathname.split('/')[2]
                    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null
                }
            }

            return null
        } catch {
            return null
        }
    }

    function convertYouTubeLinksToEmbeds(html) {
        if (!html) return ''

        const withAnchorsConverted = html.replace(/<a[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi, (match, href) => {
            const id = extractYouTubeVideoId(href)
            return id ? createYouTubeEmbed(id) : match
        })

        return withAnchorsConverted.replace(/(^|[\s>])(https?:\/\/[^\s<]+)/gi, (match, prefix, url) => {
            const id = extractYouTubeVideoId(url)
            if (!id) return match
            return `${prefix}${createYouTubeEmbed(id)}`
        })
    }

    function isAllowedYouTubeEmbedSrc(src) {
        if (!src) return false
        try {
            const url = new URL(src, window.location.origin)
            const host = url.hostname.toLowerCase()
            const isYouTubeHost = [
                'youtube.com',
                'www.youtube.com',
                'm.youtube.com',
                'youtube-nocookie.com',
                'www.youtube-nocookie.com'
            ].includes(host)

            return isYouTubeHost && url.pathname.startsWith('/embed/')
        } catch {
            return false
        }
    }

    function sanitizeFeedHtml(html) {
        const sanitized = DOMPurify.sanitize(html || '', {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'class'],
            FORBID_ATTR: ['srcdoc', 'data', 'onload', 'onerror', 'onclick', 'onmouseover', 'style']
        })

        const parser = new DOMParser()
        const doc = parser.parseFromString(`<div>${sanitized}</div>`, 'text/html')
        const wrapper = doc.body.firstElementChild
        if (!wrapper) return ''

        wrapper.querySelectorAll('iframe').forEach((frame) => {
            const src = frame.getAttribute('src') || ''
            if (!isAllowedYouTubeEmbedSrc(src)) {
                frame.remove()
                return
            }

            frame.setAttribute('allowfullscreen', 'true')
            frame.setAttribute('frameborder', '0')
            frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share')
        })

        return wrapper.innerHTML
    }

    function renderFullArticleHtml(rawHtml) {
        const sanitized = sanitizeFeedHtml(rawHtml)
        const withIframes = sanitized
            .replace(/<iframe/g, '<div class="aspect-video w-full my-6 rounded-2xl overflow-hidden shadow-2xl"><iframe class="w-full h-full"')
            .replace(/<\/iframe>/g, '</iframe></div>')

        try {
            return withIframes.replace(/<img[^>]+src="([^">]+)"/g, (m, src) => `<img src="${ImageKitService.getOptimizedUrl(src)}"`)
        } catch {
            return withIframes
        }
    }

    function getPreviewText(rawHtml) {
        const plain = DOMPurify.sanitize(rawHtml || '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
        if (plain.length <= 200) return plain
        return `${plain.slice(0, 200)}...`
    }

    async function checkUser() {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            setMyId(session.user.id)
            try {
                const { data, error } = await supabase.from('profiles').select('role, roles').eq('id', session.user.id).single()
                if (error) {
                    console.error('Failed to load profile roles', error)
                    setMyRoles(['student'])
                } else if (data) {
                    // Kompatybilność wsteczna: jeśli roles jest puste, używamy starego `role`
                    const effectiveRoles = (data.roles && data.roles.length) ? data.roles : (data.role ? [data.role] : ['student'])
                    setMyRoles(effectiveRoles)
                }
            } catch (err) {
                console.error('Error loading profile roles', err)
                setMyRoles(['student'])
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

        if (error) {
            console.error('Failed to load comments', error)
            alert('Nie udało się pobrać komentarzy.')
        }

        if (data) setComments(data)
        setCommentsLoading(false)
    }

    async function handleAddComment(e) {
        e.preventDefault()
        if (!newComment.trim() || !selectedPost || !myId) return

        const trimmed = newComment.trim()
        if (trimmed.length > MAX_COMMENT_LEN) {
            alert(`Komentarz jest za długi (max ${MAX_COMMENT_LEN} znaków).`)
            return
        }

        const cleanedComment = WordFilter.clean(trimmed)
        
        const { data, error } = await supabase
            .from('feed_comments')
            .insert([{
                post_id: selectedPost.id,
                author_id: myId,
                content: cleanedComment
            }])
            .select('*, profiles(full_name, role)')
            .single()

        if (error) {
            console.error('Failed to add comment', error)
            alert('Nie udało się dodać komentarza: ' + error.message)
            return
        }

        if (data) {
            setComments(prev => [...prev, data])
            setNewComment('')
        }
    }

    function canManageComment(comment) {
        return !!myId && (comment.author_id === myId || canModerateContent)
    }

    function canManagePost(post) {
        return !!myId && !!post && (post.author_id === myId || canModerateContent)
    }

    function handleStartEditComment(comment) {
        if (!canManageComment(comment)) return
        setEditingCommentId(comment.id)
        setEditingCommentText(comment.content || '')
    }

    function handleCancelEditComment() {
        setEditingCommentId(null)
        setEditingCommentText('')
    }

    async function handleSaveComment(commentId) {
        if (!editingCommentText.trim()) return

        const trimmed = editingCommentText.trim()
        if (trimmed.length > MAX_COMMENT_LEN) {
            alert(`Komentarz jest za długi (max ${MAX_COMMENT_LEN} znaków).`)
            return
        }

        setCommentActionBusyId(commentId)
        const cleanedComment = WordFilter.clean(trimmed)
        const { data, error } = await supabase
            .from('feed_comments')
            .update({ content: cleanedComment })
            .eq('id', commentId)
            .select('*, profiles(full_name, role)')
            .single()

        if (error) {
            console.error('Failed to update comment', error)
            alert('Nie udało się edytować komentarza: ' + error.message)
        } else if (data) {
            setComments(prev => prev.map(c => c.id === commentId ? data : c))
            handleCancelEditComment()
        }

        setCommentActionBusyId(null)
    }

    async function handleDeleteComment(commentId) {
        if (!window.confirm('Usunąć ten komentarz?')) return

        setCommentActionBusyId(commentId)
        const { error } = await supabase
            .from('feed_comments')
            .delete()
            .eq('id', commentId)

        if (error) {
            console.error('Failed to delete comment', error)
            alert('Nie udało się usunąć komentarza: ' + error.message)
        } else {
            setComments(prev => prev.filter(c => c.id !== commentId))
        }

        setCommentActionBusyId(null)
    }

    async function handleDeletePost(postId) {
        const post = posts.find(p => p.id === postId) || (selectedPost?.id === postId ? selectedPost : null)
        if (!canManagePost(post)) {
            alert('Nie masz uprawnień do usunięcia tego artykułu.')
            return
        }

        if (!window.confirm('Usunąć ten artykuł? Ta operacja jest nieodwracalna.')) return

        const { error } = await supabase
            .from('feed_posts')
            .delete()
            .eq('id', postId)

        if (error) {
            console.error('Failed to delete post', error)
            alert('Nie udało się usunąć artykułu: ' + error.message)
            return
        }

        setPosts(prev => prev.filter(p => p.id !== postId))
        if (selectedPost?.id === postId) {
            setSelectedPost(null)
            setComments([])
        }
    }

    const openPost = (post) => {
        setSelectedPost(post)
        fetchComments(post.id)
    }

    function resetArticleForm() {
        setEditingPostId(null)
        setArticleTitle('')
        setArticleCategory('News')
        setArticleHtml('')
    }

    function openCreateModal() {
        resetArticleForm()
        setIsModalOpen(true)
    }

    function openEditPostModal(post) {
        if (!post || !(post.author_id === myId || canModerateContent)) return
        setEditingPostId(post.id)
        setArticleTitle(post.title || '')
        setArticleCategory(post.category || 'News')
        setArticleHtml(post.content || '')
        setSelectedPost(null)
        setIsModalOpen(true)
    }

    async function fetchPosts(options = {}) {
        const { silent = false } = options
        if (!silent) setLoading(true)
        const { data, error } = await supabase
            .from('feed_posts')
            .select('*, profiles(full_name, role)')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Failed to load posts', error)
            alert('Nie udało się pobrać artykułów.')
        }

        if (data) setPosts(data)
        setLoading(false)
        return data || []
    }

    async function handleSavePost(e) {
        e.preventDefault()
        if (!articleTitle || !articleHtml) return

        const cleanedTitle = WordFilter.clean(articleTitle).trim()

        const htmlWithEmbeds = convertYouTubeLinksToEmbeds(articleHtml)
        const cleanedHtml = WordFilter.clean(htmlWithEmbeds).trim()

        if (cleanedTitle.length > MAX_ARTICLE_TITLE) {
            alert(`Tytuł jest za długi (max ${MAX_ARTICLE_TITLE} znaków).`)
            return
        }
        if (cleanedHtml.length > MAX_ARTICLE_HTML) {
            alert(`Treść artykułu jest za długa (max ${MAX_ARTICLE_HTML} znaków).`)
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        let error = null
        if (editingPostId) {
            const result = await supabase
                .from('feed_posts')
                .update({
                    title: cleanedTitle,
                    content: cleanedHtml,
                    category: articleCategory
                })
                .eq('id', editingPostId)
            error = result.error
        } else {
            const result = await supabase.from('feed_posts').insert([
                {
                    author_id: session.user.id,
                    title: cleanedTitle,
                    content: cleanedHtml,
                    category: articleCategory
                }
            ])
            error = result.error
        }

        if (error) {
            console.error(error)
            alert("Błąd publikacji: " + error.message)
        } else {
            setIsModalOpen(false)
            const editedId = editingPostId
            resetArticleForm()
            const refreshed = await fetchPosts({ silent: true })
            if (selectedPost) {
                const selectedId = editedId || selectedPost.id
                const updated = refreshed.find(p => p.id === selectedId)
                if (updated) setSelectedPost(updated)
            }
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
            if (!error) fetchPosts({ silent: true })
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
                fetchPosts({ silent: true })
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
                const status = err && err.status ? err.status : null;
                if (status === 429) {
                    toast.error('Przekroczono limit przesyłania plików. Spróbuj później.');
                } else if (status === 413) {
                    toast.error('Plik jest za duży dla Twojego konta.');
                } else {
                    toast.error('Błąd wgrywania zdjęcia.');
                }
            }
        };
    };

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ 'header': [1, 2, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image', 'video'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Wiadomości TEB</h2>
                    <div className="text-xs text-primary font-bold">Oficjalny Portal Szkolny</div>
                </div>
                {canPublish && (
                    <button onClick={openCreateModal} className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-[0_0_15px_rgba(59,130,246,0.5)] transition active:scale-95 flex items-center gap-2">
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
                        const optimizedFirstImg = firstImg ? ImageKitService.getOptimizedUrl(firstImg) : null;

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
                                        <img src={optimizedFirstImg} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                            <Maximize2 className="text-white" size={32} />
                                        </div>
                                    </div>
                                )}

                                <div className="p-5">
                                    <h3 onClick={() => openPost(post)} className="text-xl font-bold text-white mb-2 leading-tight cursor-pointer hover:text-primary transition">{post.title}</h3>

                                    <p className="text-gray-400 text-sm mb-6 line-clamp-3 leading-relaxed cursor-pointer" onClick={() => openPost(post)}>
                                        {getPreviewText(post.content)}
                                    </p>

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
                                            <ReportButton entityType="feed_post" entityId={post.id} subtle />
                                            <button onClick={() => openPost(post)} className="text-gray-500 hover:text-white transition flex items-center gap-1">
                                                <MessageCircle size={16} />
                                                <span className="text-xs font-bold">{post.comment_count || 0}</span>
                                            </button>
                                            {canManagePost(post) && (
                                                <button
                                                    onClick={() => handleDeletePost(post.id)}
                                                    className="text-gray-500 hover:text-red-500 transition"
                                                    title="Usuń artykuł"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
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
                            <div className="ml-auto flex items-center gap-2">
                                <ReportButton entityType="feed_post" entityId={selectedPost.id} subtle />
                                {canManagePost(selectedPost) && (
                                    <>
                                        <button
                                            onClick={() => openEditPostModal(selectedPost)}
                                            className="inline-flex items-center gap-2 bg-primary/20 text-primary hover:bg-primary/30 px-3 py-2 rounded-lg text-xs font-bold"
                                        >
                                            <Pencil size={14} /> Edytuj artykuł
                                        </button>
                                        <button
                                            onClick={() => handleDeletePost(selectedPost.id)}
                                            className="inline-flex items-center gap-2 bg-red-500/20 text-red-500 hover:bg-red-500/30 px-3 py-2 rounded-lg text-xs font-bold"
                                        >
                                            <Trash2 size={14} /> Usuń artykuł
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div
                                className="text-gray-300 text-lg leading-relaxed prose prose-invert max-w-none 
                                         prose-img:rounded-3xl prose-img:shadow-2xl prose-img:w-full prose-img:mt-10 mb-10
                                         prose-a:text-primary prose-a:font-bold
                                         prose-p:mb-4 prose-li:mb-2"
                                dangerouslySetInnerHTML={{ __html: renderFullArticleHtml(selectedPost.content) }}
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
                                        onChange={e => setNewComment(e.target.value.slice(0, MAX_COMMENT_LEN))}
                                        maxLength={MAX_COMMENT_LEN}
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
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-600">{new Date(comment.created_at).toLocaleDateString()}</span>
                                                    <ReportButton entityType="feed_comment" entityId={comment.id} subtle />
                                                    {canManageComment(comment) && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStartEditComment(comment)}
                                                                disabled={commentActionBusyId === comment.id}
                                                                className="text-gray-500 hover:text-primary transition disabled:opacity-50"
                                                                title="Edytuj komentarz"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteComment(comment.id)}
                                                                disabled={commentActionBusyId === comment.id}
                                                                className="text-gray-500 hover:text-red-500 transition disabled:opacity-50"
                                                                title="Usuń komentarz"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {editingCommentId === comment.id ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        value={editingCommentText}
                                                        onChange={(e) => setEditingCommentText(e.target.value.slice(0, MAX_COMMENT_LEN))}
                                                        maxLength={MAX_COMMENT_LEN}
                                                        className="w-full min-h-[88px] bg-background border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={handleCancelEditComment}
                                                            className="px-3 py-1.5 text-xs font-bold rounded-lg text-gray-400 hover:text-white"
                                                        >
                                                            Anuluj
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={commentActionBusyId === comment.id || !editingCommentText.trim()}
                                                            onClick={() => handleSaveComment(comment.id)}
                                                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white disabled:opacity-50"
                                                        >
                                                            Zapisz
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-400 leading-relaxed">{comment.content}</p>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal dodawania/edycji Artykułu */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="text-primary" /> {editingPostId ? 'Edycja artykułu' : 'Redaktor'}</h3>
                            <button onClick={() => { setIsModalOpen(false); resetArticleForm() }} className="text-gray-400 hover:text-white transition p-1 bg-gray-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSavePost} className="p-6 flex flex-col gap-5 overflow-y-auto">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Tytuł*</label>
                                    <input
                                        type="text" required placeholder="Nagłówek..."
                                        className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary font-bold"
                                        value={articleTitle} onChange={e => setArticleTitle(e.target.value.slice(0, MAX_ARTICLE_TITLE))}
                                        maxLength={MAX_ARTICLE_TITLE}
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
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Treść (obsługa YouTube auto-embed + CDN zdjęć)*</label>
                                <div className="bg-white rounded-xl overflow-hidden text-black border-2 border-transparent focus-within:border-primary transition p-0">
                                    <ReactQuill ref={quillRef} theme="snow" value={articleHtml} onChange={setArticleHtml} modules={modules} className="h-64" placeholder="Opisz temat..." />
                                </div>
                            </div>
                            <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end gap-3">
                                <button type="button" onClick={() => { setIsModalOpen(false); resetArticleForm() }} className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white font-bold transition">Anuluj</button>
                                <button type="submit" className="bg-primary text-white font-bold px-8 py-2.5 rounded-xl transition active:scale-95 shadow-lg">{editingPostId ? 'Zapisz zmiany' : 'Publikuj'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
