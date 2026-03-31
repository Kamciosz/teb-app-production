import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, Filter, Camera, Plus, X, Tag, Trash2, ArrowLeft, MessageCircle, ZoomIn, Heart, Inbox } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'
import MediaUploader from '../../components/common/MediaUploader'
import AppFixedLayer from '../../components/common/AppFixedLayer'
import { ImageKitService } from '../../services/imageKitService'
import { getRoleLabel } from '../profile/profileMeta'
import { useToast } from '../../context/ToastContext'
import { sanitizePlainText } from '../../utils/safeContent'

export default function ReWear() {
    const MAX_REWEAR_TITLE = 200
    const MAX_REWEAR_DESC = 2000
    const CATEGORY_OPTIONS = ['Ubrania', 'Elektronika', 'Książki', 'Korepetycje', 'Usługi', 'Inne']

    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState(null)
    const [myUserId, setMyUserId] = useState(null)
    const [lightbox, setLightbox] = useState(null) // { photos: [], index: number }
    const [interestedPostIds, setInterestedPostIds] = useState([])
    const [interestLoadingIds, setInterestLoadingIds] = useState([])
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
    const [selectedCategories, setSelectedCategories] = useState([])
    const [interestedUsers, setInterestedUsers] = useState([])
    const [loadingInterestedUsers, setLoadingInterestedUsers] = useState(false)

    const navigate = useNavigate()
    const toast = useToast()

    // Role zalogowanego użytkownika (do blokady Korepetycje/Usługi)
    const [userRoles, setUserRoles] = useState(['student'])

    // Stany formularza modal "Vinted Pro"
    const [newItemTitle, setNewItemTitle] = useState('')
    const [newItemPrice, setNewItemPrice] = useState('')
    const [newItemCurrency, setNewItemCurrency] = useState('TG') // TebGąbki lub PLN
    const [newItemDesc, setNewItemDesc] = useState('')
    const [newItemCategory, setNewItemCategory] = useState('Ubrania')
    const [newItemCondition, setNewItemCondition] = useState('Bardzo dobry')
    const [newItemSize, setNewItemSize] = useState('M')
    const [newItemSubject, setNewItemSubject] = useState('Matematyka')
    const [newItemFiles, setNewItemFiles] = useState([]) // [{file, preview}], max 3
    const MAX_PHOTOS = 3
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState('')

    const addFileEntry = (file, preview) =>
        setNewItemFiles(prev => prev.length < MAX_PHOTOS ? [...prev, { file, preview }] : prev)
    const removeFileEntry = (idx) =>
        setNewItemFiles(prev => {
            if (prev[idx]) URL.revokeObjectURL(prev[idx].preview)
            return prev.filter((_, i) => i !== idx)
        })
    const clearFiles = () =>
        setNewItemFiles(prev => { prev.forEach(e => URL.revokeObjectURL(e.preview)); return [] })

    const canTutor = userRoles.some(r => ['tutor', 'admin'].includes(r))
    const canService = userRoles.some(r => ['freelancer', 'admin'].includes(r))

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
    }

    function toggleCategory(category) {
        setSelectedCategories(prev => prev.includes(category)
            ? prev.filter(item => item !== category)
            : [...prev, category]
        )
    }

    function clearAllFilters() {
        setSelectedCategories([])
        setShowFavoritesOnly(false)
    }

    useEffect(() => {
        fetchItems()
        loadUserRoles()
    }, [])

    useEffect(() => {
        if (!myUserId) return
        fetchMyInterestedPosts(myUserId)
    }, [myUserId])

    useEffect(() => {
        if (!selectedItem || selectedItem.seller_id !== myUserId) {
            setInterestedUsers([])
            return
        }

        fetchInterestedUsers(selectedItem.id)
    }, [selectedItem, myUserId])

    async function loadUserRoles() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        setMyUserId(session.user.id)
        const { data } = await supabase.from('profiles').select('role, roles').eq('id', session.user.id).single()
        if (data) {
            const effectiveRoles = data.roles || (data.role ? [data.role] : ['student'])
            setUserRoles(effectiveRoles)
        }
    }

    async function fetchMyInterestedPosts(userId) {
        const { data, error } = await supabase
            .from('rewear_interests')
            .select('post_id')
            .eq('user_id', userId)

        if (error) {
            console.warn('Failed to load ReWear interests:', error)
            return
        }

        setInterestedPostIds((data || []).map(row => row.post_id))
    }

    async function fetchInterestedUsers(postId) {
        setLoadingInterestedUsers(true)

        try {
            const { data, error } = await supabase
                .from('rewear_interests')
                .select('user_id, created_at')
                .eq('post_id', postId)
                .order('created_at', { ascending: false })

            if (error) throw error

            const userIds = [...new Set((data || []).map(row => row.user_id).filter(Boolean))]
            if (!userIds.length) {
                setInterestedUsers([])
                return
            }

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, role')
                .in('id', userIds)

            if (profilesError) throw profilesError

            const profilesMap = new Map((profiles || []).map(profile => [profile.id, profile]))
            setInterestedUsers(
                (data || [])
                    .map(row => ({
                        ...row,
                        profile: profilesMap.get(row.user_id) || null
                    }))
                    .filter(row => row.profile)
            )
        } catch (error) {
            console.error('Failed to load interested users:', error)
            toast.error('Nie udało się pobrać listy zainteresowanych.')
        } finally {
            setLoadingInterestedUsers(false)
        }
    }

    function isInterested(postId) {
        return interestedPostIds.includes(postId)
    }

    async function toggleInterest(item, explicitState = null) {
        if (!myUserId) {
            toast.error('Zaloguj się, aby zapisywać oferty.')
            return
        }

        if (!item?.id || item.seller_id === myUserId) return

        const shouldAdd = explicitState ?? !isInterested(item.id)
        setInterestLoadingIds(prev => prev.includes(item.id) ? prev : [...prev, item.id])

        try {
            let error = null
            if (shouldAdd) {
                ({ error } = await supabase.from('rewear_interests').insert([{ post_id: item.id, user_id: myUserId }]))
                if (!error) {
                    setInterestedPostIds(prev => prev.includes(item.id) ? prev : [...prev, item.id])
                    toast.success('Oferta dodana do ulubionych.')
                }
            } else {
                ({ error } = await supabase.from('rewear_interests').delete().eq('post_id', item.id).eq('user_id', myUserId))
                if (!error) {
                    setInterestedPostIds(prev => prev.filter(postId => postId !== item.id))
                    toast.info('Oferta usunięta z ulubionych.')
                }
            }

            if (error) throw error
        } catch (error) {
            console.error('Failed to toggle ReWear interest:', error)
            toast.error(error?.message || 'Nie udało się zmienić ulubionych.')
        } finally {
            setInterestLoadingIds(prev => prev.filter(id => id !== item.id))
        }
    }

    function openReWearConversation(item) {
        navigate(`/rewear/inbox?post=${item.id}`)
    }

    async function handleDeleteItem(itemId) {
        if (!confirm('Czy na pewno chcesz trwale usunąć to ogłoszenie? Powiązane rozmowy ReWear zostaną usunięte razem z nim.')) return
        const { error } = await supabase
            .from('rewear_posts')
            .delete()
            .eq('id', itemId)
            .eq('seller_id', myUserId)
        if (error) {
            console.error(error)
            alert('Błąd usuwania: ' + error.message)
        } else {
            setSelectedItem(null)
            fetchItems()
        }
    }

    async function handleUpdateItemStatus(itemId, nextStatus) {
        if (!['active', 'archived'].includes(nextStatus)) return

        const confirmationText = nextStatus === 'archived'
            ? 'Oznaczyć ogłoszenie jako nieaktualne/zarezerwowane? Czaty ReWear pozostaną dostępne.'
            : 'Przywrócić ogłoszenie jako aktywne?'

        if (!confirm(confirmationText)) return

        const { error } = await supabase
            .from('rewear_posts')
            .update({ status: nextStatus })
            .eq('id', itemId)
            .eq('seller_id', myUserId)

        if (error) {
            console.error('Failed to update ReWear status:', error)
            toast.error(error.message || 'Nie udało się zmienić statusu ogłoszenia.')
            return
        }

        setSelectedItem(prev => prev && prev.id === itemId ? { ...prev, status: nextStatus } : prev)
        setItems(prev => {
            const updated = prev.map(item => item.id === itemId ? { ...item, status: nextStatus } : item)
            return nextStatus === 'archived' ? updated.filter(item => item.id !== itemId) : updated
        })
        toast.success(nextStatus === 'archived' ? 'Ogłoszenie oznaczone jako nieaktualne.' : 'Ogłoszenie ponownie aktywne.')
    }

    async function fetchItems() {
        setLoading(true)

        try {
            const { data: posts, error: postsError } = await supabase
                .from('rewear_posts')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false })

            if (postsError) throw postsError

            const sellerIds = [...new Set((posts || []).map(item => item.seller_id).filter(Boolean))]
            let profilesMap = new Map()

            if (sellerIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url, role')
                    .in('id', sellerIds)

                if (profilesError) throw profilesError
                profilesMap = new Map((profiles || []).map(profile => [profile.id, profile]))
            }

            const hydratedItems = (posts || []).map(item => ({
                ...item,
                profiles: profilesMap.get(item.seller_id) || null
            }))

            setItems(hydratedItems)
        } catch (error) {
            console.error('Failed to fetch ReWear posts:', error)
            setItems([])
            toast.error('Nie udało się pobrać ofert ReWear. Odśwież widok.')
        } finally {
            setLoading(false)
        }
    }

    async function handleAddItem(e) {
        e.preventDefault()
        const safeTitle = sanitizePlainText(newItemTitle, { maxLength: MAX_REWEAR_TITLE })
        const safeDescription = sanitizePlainText(newItemDesc, { maxLength: MAX_REWEAR_DESC, preserveLineBreaks: true })

        if (!safeTitle || !newItemPrice || !safeDescription) return

        if (safeTitle.length > MAX_REWEAR_TITLE) {
            alert(`Tytuł jest za długi (max ${MAX_REWEAR_TITLE} znaków).`)
            return
        }
        if (safeDescription.length > MAX_REWEAR_DESC) {
            alert(`Opis jest za długi (max ${MAX_REWEAR_DESC} znaków).`)
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Walidacja roli
        let dbItemType = 'item'
        if (newItemCategory === 'Korepetycje') {
            if (!canTutor) {
                alert('Ogłoszenia Korepetycji mogą wystawiać tylko użytkownicy z rolą Korepetytora.\nSkontaktuj się z administratorem, aby uzyskać tę rolę.')
                return
            }
            dbItemType = 'tutoring'
        }
        if (newItemCategory === 'Usługi') {
            if (!canService) {
                alert('Ogłoszenia Usług mogą wystawiać tylko użytkownicy z rolą Freelancera.\nSkontaktuj się z administratorem, aby uzyskać tę rolę.')
                return
            }
            dbItemType = 'service'
        }

        setUploading(true)

        try {
            // Wysyłka zdjęć dopiero przy kliknięciu „Dodaj ogłoszenie"
            const uploadedUrls = []
            for (let i = 0; i < newItemFiles.length; i++) {
                setUploadProgress(`Wysyłanie zdjęcia ${i + 1}/${newItemFiles.length}...`)
                const url = await ImageKitService.upload(
                    newItemFiles[i].file,
                    `rewear_${Date.now()}_${i}.webp`,
                    'rewear'
                )
                uploadedUrls.push(url)
            }

            setUploadProgress('Publikowanie ogłoszenia...')

            const extraDesc = JSON.stringify({
                category: newItemCategory,
                condition: newItemCondition,
                size: newItemCategory === 'Ubrania' ? newItemSize : null,
                subject: newItemCategory === 'Korepetycje' ? newItemSubject : null,
                photos: uploadedUrls
            })

            const { error } = await supabase.from('rewear_posts').insert([{
                seller_id: session.user.id,
                title: safeTitle,
                description: safeDescription + ' |META:' + extraDesc,
                price_teb_gabki: newItemCurrency === 'TG' ? parseFloat(newItemPrice) : 0,
                price_pln: newItemCurrency === 'PLN' ? parseFloat(newItemPrice) : 0,
                item_type: dbItemType,
                image_url: uploadedUrls[0] || null,
                status: 'active'
            }])

            if (error) {
                console.error(error)
                alert('Błąd publikacji: ' + error.message)
            } else {
                setIsModalOpen(false)
                setNewItemTitle('')
                setNewItemPrice('')
                setNewItemDesc('')
                clearFiles()
                fetchItems()
            }
        } catch (err) {
            console.error('Submit error:', err)
            alert('Błąd podczas wysyłania: ' + (err?.message || 'Spróbuj ponownie.'))
        } finally {
            setUploading(false)
            setUploadProgress('')
        }
    }

    const parseDescription = (desc) => {
        if (!desc) return { category: "Inne", condition: "?", size: null }
        if (desc.includes('|META:')) {
            try {
                return JSON.parse(desc.split('|META:')[1])
            } catch { return { category: "Inne", condition: "?", size: null } }
        }
        return { category: "Inne", condition: "?", size: null }
    }

    const cleanDescription = (desc) => {
        if (!desc) return "Brak opisu"
        return sanitizePlainText(desc.split('|META:')[0], { maxLength: MAX_REWEAR_DESC, preserveLineBreaks: true })
    }

    // Aplikacja Filtrów
    const filteredItems = items.filter(item => {
        const meta = parseDescription(item.description)
        const category = meta.category || 'Inne'

        if (showFavoritesOnly && !interestedPostIds.includes(item.id)) return false
        if (selectedCategories.length > 0 && !selectedCategories.includes(category)) return false

        const query = normalizeText(searchQuery)
        if (!query) return true

        const searchableText = normalizeText([
            item.title,
            cleanDescription(item.description),
            category,
            item.profiles?.full_name,
            meta.subject
        ].filter(Boolean).join(' '))

        return searchableText.includes(query)
    })

    return (
        <div className="relative min-h-[80vh] pb-10">
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">Re-Wear</h2>
                <div className="bg-surface border border-gray-700 p-2 rounded-full flex gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => navigate('/rewear/inbox')}
                        className="w-9 h-9 rounded-full bg-background border border-gray-800 flex items-center justify-center text-primary hover:text-white transition"
                        title="Skrzynka ReWear"
                    >
                        <Inbox size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowFavoritesOnly(prev => !prev)}
                        className={`w-9 h-9 rounded-full border flex items-center justify-center transition ${showFavoritesOnly ? 'border-primary bg-primary/20 text-primary' : 'border-gray-800 bg-background text-gray-400 hover:text-white'}`}
                        title="Pokaż ulubione"
                    >
                        <Heart size={18} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsFilterModalOpen(true)}
                        className={`w-9 h-9 rounded-full border flex items-center justify-center transition ${selectedCategories.length > 0 ? 'border-primary bg-primary/20 text-primary' : 'border-gray-800 bg-background text-gray-400 hover:text-white'}`}
                        title="Filtry"
                    >
                        <Filter size={18} />
                    </button>
                </div>
            </div>

            <div className="mb-3 px-2">
                <div className="flex items-center gap-2 bg-surface border border-gray-800 rounded-2xl px-3 py-2">
                    <Search className="text-gray-500" size={18} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value.slice(0, 120))}
                        placeholder="Szukaj konkretnej oferty, sprzedawcy lub kategorii..."
                        className="w-full bg-transparent text-white placeholder:text-gray-500 text-sm outline-none"
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-center text-gray-500 mt-10 animate-pulse">Przeszukiwanie szkolnych ofert...</div>
            ) : (
                <div className="grid grid-cols-2 gap-3 px-1">
                    {filteredItems.map(item => {
                        const meta = parseDescription(item.description)
                        return (
                            <div key={item.id} onClick={() => setSelectedItem(item)} className="bg-surface border border-gray-800 rounded-2xl overflow-hidden shadow-lg flex flex-col w-full cursor-pointer hover:border-gray-600 transition">
                                <div className="h-40 bg-[#1a1a1a] flex flex-col items-center justify-center relative overflow-hidden group">
                                    {item.image_url ? (
                                        <img
                                            src={ImageKitService.getOptimizedUrl(item.image_url)}
                                            alt={item.title}
                                            loading="lazy"
                                            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                                        />
                                    ) : (
                                        <>
                                            <Camera className="text-gray-700 mb-2" size={32} />
                                            <span className="text-gray-600 font-bold text-xs">Bez zdjęcia</span>
                                        </>
                                    )}

                                    <div className="absolute top-2 left-2 z-10">
                                        <ReportButton entityType="rewear_post" entityId={item.id} subtle={true} />
                                    </div>

                                    <div className="absolute top-2 right-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded text-[10px] text-white font-bold border border-gray-700 flex items-center gap-1">
                                        <Tag size={10} className="text-primary" /> {meta.condition}
                                    </div>
                                    {meta.size && (
                                        <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-[10px] text-white font-bold border border-gray-700">
                                            {meta.size}
                                        </div>
                                    )}
                                    {meta.subject && (
                                        <div className="absolute bottom-2 left-2 bg-primary/90 px-2 py-1 rounded text-[10px] text-white font-bold border border-primary/50 uppercase">
                                            {meta.subject}
                                        </div>
                                    )}
                                    {!myUserId || item.seller_id === myUserId ? null : (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                toggleInterest(item)
                                            }}
                                            disabled={interestLoadingIds.includes(item.id)}
                                            className={`absolute bottom-2 right-2 w-9 h-9 rounded-full border flex items-center justify-center transition ${isInterested(item.id) ? 'border-primary bg-primary text-white' : 'border-gray-700 bg-black/70 text-gray-300 hover:text-white'}`}
                                            title={isInterested(item.id) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                                        >
                                            <Heart size={14} fill={isInterested(item.id) ? 'currentColor' : 'none'} />
                                        </button>
                                    )}
                                </div>
                                <div className="p-3 flex flex-col grow justify-between">
                                    <div>
                                        <div className="text-lg font-bold text-white leading-tight mb-1 break-words line-clamp-2">{item.title}</div>
                                        <div className="text-xs text-gray-400 mb-2 break-words line-clamp-2">{cleanDescription(item.description)}</div>
                                    </div>
                                    <div className="flex justify-between items-end mt-2">
                                        <div className="text-xl font-bold text-primary">
                                            {item.price_teb_gabki > 0 ? `${item.price_teb_gabki} TG` : `${item.price_pln} ZŁ`}
                                        </div>
                                        <div className="text-[10px] text-gray-500 max-w-[50%] truncate text-right">{item.profiles?.full_name}</div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {filteredItems.length === 0 && <div className="col-span-2 text-center text-gray-500 mt-10 p-8 border border-gray-800 rounded-2xl border-dashed">Brak ofert dla wybranych filtrów lub frazy wyszukiwania.</div>}
                </div>
            )}

            {isFilterModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center px-3 pt-16 pb-24 sm:p-4">
                    <div className="bg-surface border border-gray-700 w-full sm:max-w-md rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-[#1a1a1a]">
                            <h3 className="text-base font-bold text-white">Filtry ofert</h3>
                            <button
                                type="button"
                                onClick={() => setIsFilterModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-background border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto min-h-0">
                            <div>
                                <div className="text-xs text-gray-500 font-bold mb-2">KATEGORIE</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {CATEGORY_OPTIONS.map(category => {
                                        const active = selectedCategories.includes(category)
                                        return (
                                            <button
                                                key={category}
                                                type="button"
                                                onClick={() => toggleCategory(category)}
                                                className={`px-3 py-2 rounded-xl border text-sm font-bold transition ${active ? 'border-primary bg-primary/20 text-primary' : 'border-gray-700 bg-background text-gray-300 hover:border-gray-600'}`}
                                            >
                                                {category}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-800 bg-background">
                                <div>
                                    <div className="text-sm font-bold text-white">Tylko ulubione</div>
                                    <div className="text-xs text-gray-500">Pokaż zapisane oferty</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowFavoritesOnly(prev => !prev)}
                                    className={`w-11 h-7 rounded-full border flex items-center px-1 transition ${showFavoritesOnly ? 'border-primary bg-primary/20 justify-end' : 'border-gray-700 bg-surface justify-start'}`}
                                >
                                    <span className={`w-5 h-5 rounded-full ${showFavoritesOnly ? 'bg-primary' : 'bg-gray-600'}`} />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 pt-0 grid grid-cols-2 gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className="py-3 rounded-xl border border-gray-700 text-gray-300 font-bold"
                            >
                                Wyczyść
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFilterModalOpen(false)}
                                className="py-3 rounded-xl bg-primary text-white font-bold"
                            >
                                Zastosuj
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Szczegółów Oferty */}
            {selectedItem && (() => {
                const meta = parseDescription(selectedItem.description)
                const isOwner = selectedItem.seller_id === myUserId
                return (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-end sm:items-center p-0">
                        <div className="bg-surface border border-gray-700 w-full h-full sm:h-auto sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-3xl sm:rounded-t-2xl">
                                <button onClick={() => setSelectedItem(null)} className="p-2 -ml-2 text-gray-400 hover:text-white transition">
                                    <ArrowLeft size={20} />
                                </button>
                                <div className="flex gap-2">
                                    <ReportButton entityType="rewear_post" entityId={selectedItem.id} subtle={true} />
                                    {isOwner && (
                                        <button
                                            onClick={() => handleDeleteItem(selectedItem.id)}
                                            className="p-2 text-red-500 hover:text-red-400 transition"
                                            title="Usuń ogłoszenie"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+2rem)]">
                                {(() => {
                                    const allPhotos = meta.photos?.length > 0 ? meta.photos : (selectedItem.image_url ? [selectedItem.image_url] : [])
                                    return allPhotos.length > 0 ? (
                                        <div className="relative group">
                                            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none">
                                                {allPhotos.map((url, i) => (
                                                    <div
                                                        key={i}
                                                        className="snap-center shrink-0 w-full relative cursor-zoom-in"
                                                        onClick={() => setLightbox({ photos: allPhotos, index: i })}
                                                    >
                                                        <img
                                                            src={ImageKitService.getOptimizedUrl(url)}
                                                            alt={selectedItem.title}
                                                            className="w-full max-h-[40vh] sm:h-56 object-contain bg-[#1a1a1a]"
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                                                            <div className="bg-black/50 rounded-full p-2">
                                                                <ZoomIn size={20} className="text-white" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {allPhotos.length > 1 && (
                                                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                                                    {allPhotos.map((_, i) => (
                                                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full h-40 bg-[#1a1a1a] flex items-center justify-center">
                                            <Camera className="text-gray-700" size={40} />
                                        </div>
                                    )
                                })()}
                                <div className="p-5 flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="text-xl font-bold text-white leading-tight break-words max-w-[72%]">{selectedItem.title}</h3>
                                        <div className="text-2xl font-bold text-primary whitespace-nowrap">
                                            {selectedItem.price_teb_gabki > 0 ? `${selectedItem.price_teb_gabki} TG` : `${selectedItem.price_pln} ZŁ`}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <span className="px-3 py-1 bg-background border border-gray-700 rounded-full text-xs font-bold text-gray-300 flex items-center gap-1">
                                            <Tag size={10} className="text-primary" /> {meta.condition}
                                        </span>
                                        {meta.category && <span className="px-3 py-1 bg-background border border-gray-700 rounded-full text-xs font-bold text-gray-300">{meta.category}</span>}
                                        {meta.size && <span className="px-3 py-1 bg-background border border-gray-700 rounded-full text-xs font-bold text-gray-300">Rozmiar: {meta.size}</span>}
                                        {meta.subject && <span className="px-3 py-1 bg-primary/20 border border-primary/30 rounded-full text-xs font-bold text-primary">{meta.subject}</span>}
                                    </div>
                                    <p className="text-sm text-gray-300 leading-relaxed break-words">{cleanDescription(selectedItem.description)}</p>
                                    <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
                                        <div className="text-xs text-gray-500">
                                            Wystawil:{' '}
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/profile/${selectedItem.seller_id}`)}
                                                className="text-white font-bold hover:text-primary transition"
                                            >
                                                {selectedItem.profiles?.full_name}
                                            </button>
                                            <span className="text-gray-600 ml-2">{getRoleLabel(selectedItem.profiles?.role || 'student')}</span>
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {new Date(selectedItem.created_at).toLocaleDateString('pl-PL')}
                                        </div>
                                    </div>
                                    {isOwner && (
                                        <div className="rounded-xl border border-gray-800 bg-background p-3 flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xs text-gray-500">Status ogłoszenia</div>
                                                <div className="text-sm font-bold text-white">
                                                    {selectedItem.status === 'active' ? 'Aktywne' : 'Nieaktualne / zarezerwowane'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateItemStatus(selectedItem.id, selectedItem.status === 'active' ? 'archived' : 'active')}
                                                className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/15 text-primary text-xs font-bold"
                                            >
                                                {selectedItem.status === 'active' ? 'Oznacz nieaktualne' : 'Przywróć aktywne'}
                                            </button>
                                        </div>
                                    )}
                                    {!isOwner && (
                                        <div className="grid grid-cols-2 gap-3 mt-1">
                                            <button
                                                type="button"
                                                onClick={() => toggleInterest(selectedItem)}
                                                disabled={interestLoadingIds.includes(selectedItem.id)}
                                                className={`px-3 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 border text-center ${isInterested(selectedItem.id) ? 'bg-primary/15 text-primary border-primary/30' : 'bg-background text-gray-200 border-gray-700 hover:border-primary/40'}`}
                                            >
                                                <span className="shrink-0 flex items-center justify-center">
                                                    <Heart size={16} fill={isInterested(selectedItem.id) ? 'currentColor' : 'none'} />
                                                </span>
                                                <span className="leading-tight">{isInterested(selectedItem.id) ? 'W ulubionych' : 'Dodaj do ulubionych'}</span>
                                            </button>
                                            <button
                                                onClick={() => openReWearConversation(selectedItem)}
                                                className="px-3 py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-[0_4px_15px_rgba(59,130,246,0.3)] text-center"
                                            >
                                                <span className="shrink-0 flex items-center justify-center">
                                                    <MessageCircle size={16} />
                                                </span>
                                                <span className="leading-tight">Napisz w ReWear</span>
                                            </button>
                                        </div>
                                    )}
                                    {isOwner && (
                                        <>
                                            <div className="mt-2 rounded-2xl border border-gray-800 bg-background/70 p-4">
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <div>
                                                        <div className="text-sm font-bold text-white">Zainteresowani</div>
                                                        <div className="text-[11px] text-gray-500">Tylko Ty widzisz tę listę.</div>
                                                    </div>
                                                    <div className="text-sm font-black text-primary">{interestedUsers.length}</div>
                                                </div>
                                                {loadingInterestedUsers ? (
                                                    <div className="text-xs text-gray-500">Ładowanie listy zainteresowanych...</div>
                                                ) : interestedUsers.length === 0 ? (
                                                    <div className="text-xs text-gray-500">Na razie nikt nie dodał tej oferty do ulubionych.</div>
                                                ) : (
                                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                                        {interestedUsers.map(entry => (
                                                            <button
                                                                key={entry.user_id}
                                                                type="button"
                                                                onClick={() => navigate(`/profile/${entry.user_id}`)}
                                                                className="w-full flex items-center justify-between gap-3 bg-surface border border-gray-800 rounded-xl px-3 py-2 text-left hover:border-gray-700 transition"
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-10 h-10 rounded-full bg-[#1a1a1a] overflow-hidden shrink-0 border border-gray-800">
                                                                        {entry.profile?.avatar_url ? (
                                                                            <img src={ImageKitService.getOptimizedUrl(entry.profile.avatar_url)} alt={entry.profile.full_name} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-gray-500 font-black text-xs">
                                                                                {(entry.profile?.full_name || 'U').slice(0, 1).toUpperCase()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-bold text-white truncate">{entry.profile?.full_name || 'Użytkownik'}</div>
                                                                        <div className="text-[11px] text-gray-500 truncate">{getRoleLabel(entry.profile?.role || 'student')}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-[10px] text-gray-500 whitespace-nowrap">
                                                                    {new Date(entry.created_at).toLocaleDateString('pl-PL')}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleDeleteItem(selectedItem.id)}
                                                className="w-full py-3 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-900/40 transition mt-3"
                                            >
                                                <Trash2 size={16} /> Usuń ogłoszenie
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* FAB (Floating Action Button) do szybkiego aparatu/oferty */}
            <AppFixedLayer className="bottom-24 z-40 px-4">
                <div className="flex justify-end">
                    <button onClick={() => setIsModalOpen(true)} className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(59,130,246,0.5)] transition transform active:scale-95">
                        <Plus size={30} strokeWidth={3} />
                    </button>
                </div>
            </AppFixedLayer>

            {/* Modal "Vinted Pro" */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-end sm:items-center p-0">
                    <div className="bg-surface border border-gray-700 w-full h-full sm:h-auto sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl sm:rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white">Wystaw Przedmiot</h3>
                            <button onClick={() => { setIsModalOpen(false); clearFiles() }} className="text-gray-400 hover:text-white transition bg-background p-1 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddItem} className="p-6 flex flex-col gap-4 overflow-y-auto flex-1 pb-[calc(env(safe-area-inset-bottom)+2rem)]">

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs text-gray-400 font-bold">Zdjęcia</label>
                                    <span className={`text-xs font-bold ${newItemFiles.length === MAX_PHOTOS ? 'text-green-400' : 'text-gray-500'}`}>
                                        {newItemFiles.length}/{MAX_PHOTOS}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {/* Wypełnione sloty */}
                                    {newItemFiles.map((entry, i) => (
                                        <div key={i} className={`relative aspect-square rounded-xl overflow-hidden border-2 ${i === 0 ? 'border-primary' : 'border-gray-700'}`}>
                                            <img
                                                src={entry.preview}
                                                alt=""
                                                className="w-full h-full object-cover cursor-zoom-in"
                                                onClick={() => setLightbox({ photos: newItemFiles.map(e => e.preview), index: i })}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeFileEntry(i)}
                                                className="absolute top-1 right-1 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center text-white border border-gray-600 hover:bg-red-900/80 transition"
                                            >
                                                <X size={11} />
                                            </button>
                                            {i === 0 && (
                                                <div className="absolute bottom-1 left-1 right-1 text-center text-[9px] bg-primary/90 px-1 py-0.5 rounded text-white font-bold">
                                                    Główne
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {/* Slot "Dodaj" — widoczny gdy < MAX */}
                                    {newItemFiles.length < MAX_PHOTOS && (
                                        <MediaUploader module="rewear" onFileReady={addFileEntry}>
                                            <div className="aspect-square flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-700 bg-background text-gray-500 cursor-pointer hover:border-primary hover:text-primary transition" style={{ minHeight: '90px' }}>
                                                <Camera size={22} />
                                                <span className="text-[10px] mt-1 font-bold">Dodaj</span>
                                            </div>
                                        </MediaUploader>
                                    )}
                                    {/* Puste placeholdery dla wizualnej spójności siatki */}
                                    {Array.from({ length: Math.max(0, MAX_PHOTOS - newItemFiles.length - 1) }).map((_, i) => (
                                        <div key={`ph-${i}`} className="aspect-square rounded-xl border border-dashed border-gray-800 bg-background/30" style={{ minHeight: '90px' }} />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Tytuł ogłoszenia</label>
                                <input
                                    type="text" placeholder="np. Bluza Szkolna, stan bdb!" required
                                    className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary font-bold"
                                    value={newItemTitle} onChange={e => setNewItemTitle(e.target.value.slice(0, MAX_REWEAR_TITLE))}
                                    maxLength={MAX_REWEAR_TITLE}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Opis przedmiotu</label>
                                <textarea
                                    required rows={3} placeholder="Opisz dokładnie swój przedmiot..."
                                    className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary resize-none text-sm"
                                    value={newItemDesc} onChange={e => setNewItemDesc(e.target.value.slice(0, MAX_REWEAR_DESC))}
                                    maxLength={MAX_REWEAR_DESC}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Kategoria</label>
                                    <select
                                        className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary appearance-none cursor-pointer text-sm"
                                        value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}
                                    >
                                        <option>Ubrania</option>
                                        <option>Elektronika</option>
                                        <option>Książki</option>
                                        <option>Korepetycje</option>
                                        <option>Usługi</option>
                                        <option>Inne</option>
                                    </select>
                                </div>
                                <div className="relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs text-gray-400 font-bold block">Cena</label>
                                        <select
                                            className="text-[10px] bg-background border-none text-primary font-bold outline-none"
                                            value={newItemCurrency}
                                            onChange={(e) => setNewItemCurrency(e.target.value)}
                                        >
                                            <option value="TG">TG</option>
                                            <option value="PLN">ZŁ</option>
                                        </select>
                                    </div>
                                    <input
                                        type="number" step="0.01" placeholder="0" required
                                        className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary font-bold text-primary pl-10"
                                        value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                                    />
                                    <span className="absolute left-3 bottom-3.5 text-gray-500 font-bold">{newItemCurrency}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Stan</label>
                                    <select
                                        className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary appearance-none cursor-pointer text-sm"
                                        value={newItemCondition} onChange={e => setNewItemCondition(e.target.value)}
                                    >
                                        <option>Nowy</option>
                                        <option>Bardzo dobry</option>
                                        <option>Dobry</option>
                                        <option>Zadowalający</option>
                                    </select>
                                </div>
                                {newItemCategory === 'Ubrania' && (
                                    <div>
                                        <label className="text-xs text-gray-400 font-bold mb-1 block">Rozmiar</label>
                                        <select
                                            className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary appearance-none cursor-pointer text-sm"
                                            value={newItemSize} onChange={e => setNewItemSize(e.target.value)}
                                        >
                                            <option>XS</option>
                                            <option>S</option>
                                            <option>M</option>
                                            <option>L</option>
                                            <option>XL</option>
                                            <option>XXL</option>
                                        </select>
                                    </div>
                                )}
                                {newItemCategory === 'Korepetycje' && (
                                    <div>
                                        <label className="text-xs text-gray-400 font-bold mb-1 block">Przedmiot</label>
                                        <select
                                            className="w-full p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-primary appearance-none cursor-pointer text-sm"
                                            value={newItemSubject} onChange={e => setNewItemSubject(e.target.value)}
                                        >
                                            <option>Matematyka</option>
                                            <option>Polski</option>
                                            <option>Angielski</option>
                                            <option>Informatyka</option>
                                            <option>Programowanie</option>
                                            <option>Zawodowe</option>
                                            <option>Inne</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <button type="submit" disabled={uploading} className={`bg-primary text-white font-bold py-3 rounded-xl mt-4 transition active:scale-95 shadow-[0_4px_15px_rgba(59,130,246,0.3)] w-full ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                {uploading ? (uploadProgress || 'Wysyłanie...') : 'Dodać Ogłoszenie'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Lightbox — fullscreen podgląd zdjęć (portal escapes all stacking contexts) */}
            {lightbox && createPortal(
                <div
                    className="fixed inset-0 bg-black z-[100] flex flex-col"
                    onClick={() => setLightbox(null)}
                >
                    {/* Pasek górny */}
                    <div className="flex justify-between items-center px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
                        <span className="text-white/60 text-sm font-bold">
                            {lightbox.index + 1} / {lightbox.photos.length}
                        </span>
                        <button
                            className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition"
                            onClick={() => setLightbox(null)}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Zdjęcie */}
                    <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
                        <img
                            src={lightbox.photos[lightbox.index]}
                            alt=""
                            className="max-w-full max-h-full object-contain select-none"
                            draggable={false}
                        />
                    </div>

                    {/* Nawigacja strzałki (gdy > 1 zdjęcie) */}
                    {lightbox.photos.length > 1 && (
                        <div className="flex justify-between items-center px-4 py-4 shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition disabled:opacity-30"
                                disabled={lightbox.index === 0}
                                onClick={() => setLightbox(lb => ({ ...lb, index: lb.index - 1 }))}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            {/* Kropki */}
                            <div className="flex gap-2">
                                {lightbox.photos.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setLightbox(lb => ({ ...lb, index: i }))}
                                        className={`w-2 h-2 rounded-full transition ${i === lightbox.index ? 'bg-white scale-125' : 'bg-white/40'}`}
                                    />
                                ))}
                            </div>
                            <button
                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition disabled:opacity-30"
                                disabled={lightbox.index === lightbox.photos.length - 1}
                                onClick={() => setLightbox(lb => ({ ...lb, index: lb.index + 1 }))}
                            >
                                <ArrowLeft size={20} className="rotate-180" />
                            </button>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    )
}
