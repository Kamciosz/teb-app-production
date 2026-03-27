import React, { useState, useEffect } from 'react'
import { Search, Filter, Camera, Plus, X, Tag, Trash2, ArrowLeft, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'
import MediaUploader from '../../components/common/MediaUploader'
import { ImageKitService } from '../../services/imageKitService'

export default function ReWear() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState(null)
    const [myUserId, setMyUserId] = useState(null)

    const navigate = useNavigate()

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
    const [newItemPhotoUrl, setNewItemPhotoUrl] = useState(null)
    const [uploading, setUploading] = useState(false)

    // Filtrowanie
    const [activeFilter, setActiveFilter] = useState('Wszystko')

    const canTutor = userRoles.some(r => ['tutor', 'admin'].includes(r))
    const canService = userRoles.some(r => ['freelancer', 'admin'].includes(r))

    useEffect(() => {
        fetchItems()
        loadUserRoles()
    }, [])

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

    async function handleDeleteItem(itemId) {
        if (!confirm('Czy na pewno chcesz usunąć to ogłoszenie?')) return
        const { error } = await supabase
            .from('rewear_posts')
            .update({ status: 'archived' })
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

    async function fetchItems() {
        const { data, error } = await supabase
            .from('rewear_posts')
            .select('*, profiles(full_name, avatar_url, role)')
            .eq('status', 'active')
            .order('created_at', { ascending: false })

        if (data) setItems(data)
        setLoading(false)
    }

    async function handleAddItem(e) {
        e.preventDefault()
        if (!newItemTitle || !newItemPrice || !newItemDesc) return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Formowanie pełnego opisu zawierającego też dodatkowe dane (stan, kategoria) do JSON by zachować stary ład filtrów
        const extraDesc = JSON.stringify({
            category: newItemCategory,
            condition: newItemCondition,
            size: newItemCategory === 'Ubrania' ? newItemSize : null,
            subject: newItemCategory === 'Korepetycje' ? newItemSubject : null
        })

        // Definicja item_type z walidacją roli nadanej przez administratora
        let dbItemType = 'item'
        if (newItemCategory === 'Korepetycje') {
            if (!canTutor) {
                alert('Ogłoszenia Korepetycji mogą wystawiać tylko użytkownicy z rolą Korepetytora.\nSkontaktuj się z administratorem, aby uzyskać tę rolę.')
                setUploading(false)
                return
            }
            dbItemType = 'tutoring'
        }
        if (newItemCategory === 'Usługi') {
            if (!canService) {
                alert('Ogłoszenia Usług mogą wystawiać tylko użytkownicy z rolą Freelancera.\nSkontaktuj się z administratorem, aby uzyskać tę rolę.')
                setUploading(false)
                return
            }
            dbItemType = 'service'
        }

        setUploading(true)

        const { error } = await supabase.from('rewear_posts').insert([
            {
                seller_id: session.user.id,
                title: newItemTitle,
                description: newItemDesc + " |META:" + extraDesc,
                price_teb_gabki: newItemCurrency === 'TG' ? parseFloat(newItemPrice) : 0,
                price_pln: newItemCurrency === 'PLN' ? parseFloat(newItemPrice) : 0,
                item_type: dbItemType,
                image_url: newItemPhotoUrl,
                status: 'active'
            }
        ])

        setUploading(false)

        if (error) {
            console.error(error)
            alert("Błąd publikacji: " + error.message)
        } else {
            // Nagroda 10 TG za wystawienie
            const { data: profile } = await supabase.from('profiles').select('teb_gabki').eq('id', session.user.id).single()
            if (profile) {
                await supabase.from('profiles').update({ teb_gabki: profile.teb_gabki + 10 }).eq('id', session.user.id)
            }
            setIsModalOpen(false)
            setNewItemTitle('')
            setNewItemPrice('')
            setNewItemDesc('')
            setNewItemPhotoUrl(null)
            fetchItems()
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
        return desc.split('|META:')[0]
    }

    // Aplikacja Filtrów
    const filteredItems = items.filter(item => {
        if (activeFilter === 'Wszystko') return true;
        const meta = parseDescription(item.description)
        return meta.category === activeFilter;
    })

    return (
        <div className="relative min-h-[80vh] pb-10">
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">Re-Wear</h2>
                <div className="bg-surface border border-gray-700 p-2 rounded-full flex gap-2">
                    <Search className="text-gray-400" size={20} />
                    <Filter className="text-primary" size={20} />
                </div>
            </div>

            {/* Pasek Filtrów */}
            <div className="flex overflow-x-auto gap-2 pb-4 px-2 scrollbar-none mb-2">
                {['Wszystko', 'Ubrania', 'Elektronika', 'Książki', 'Korepetycje', 'Usługi', 'Inne'].map(cat => (
                    <button
                        key={cat} onClick={() => setActiveFilter(cat)}
                        className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition ${activeFilter === cat ? 'bg-primary text-white shadow-[0_4px_10px_rgba(59,130,246,0.3)]' : 'bg-surface text-gray-400 border border-gray-800'}`}
                    >
                        {cat}
                    </button>
                ))}
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
                                </div>
                                <div className="p-3 flex flex-col grow justify-between">
                                    <div>
                                        <div className="text-lg font-bold text-white leading-tight mb-1 truncate">{item.title}</div>
                                        <div className="text-xs text-gray-400 mb-2 truncate">{cleanDescription(item.description)}</div>
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

                    {filteredItems.length === 0 && <div className="col-span-2 text-center text-gray-500 mt-10 p-8 border border-gray-800 rounded-2xl border-dashed">Brak ofert w tej kategorii. Zostań pierwszym!</div>}
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
                                {selectedItem.image_url ? (
                                    <img src={ImageKitService.getOptimizedUrl(selectedItem.image_url)} alt={selectedItem.title} className="w-full h-auto max-h-[40vh] sm:h-56 object-contain" />
                                ) : (
                                    <div className="w-full max-h-[30vh] h-40 bg-[#1a1a1a] flex items-center justify-center">
                                        <Camera className="text-gray-700" size={40} />
                                    </div>
                                )}
                                <div className="p-5 flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="text-xl font-bold text-white leading-tight">{selectedItem.title}</h3>
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
                                    <p className="text-sm text-gray-300 leading-relaxed">{cleanDescription(selectedItem.description)}</p>
                                    <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
                                        <div className="text-xs text-gray-500">
                                            Wystawił: <span className="text-white font-bold">{selectedItem.profiles?.full_name}</span>
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {new Date(selectedItem.created_at).toLocaleDateString('pl-PL')}
                                        </div>
                                    </div>
                                    {!isOwner && (
                                        <button
                                            onClick={() => navigate('/tebtalk', {
                                                state: {
                                                    openChatWith: {
                                                        id: selectedItem.seller_id,
                                                        full_name: selectedItem.profiles?.full_name || 'Sprzedawca',
                                                        avatar_url: selectedItem.profiles?.avatar_url || null,
                                                        role: selectedItem.profiles?.role || 'student',
                                                    }
                                                }
                                            })}
                                            className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-[0_4px_15px_rgba(59,130,246,0.3)] mt-1"
                                        >
                                            <MessageCircle size={16} /> Napisz do sprzedawcy
                                        </button>
                                    )}
                                    {isOwner && (
                                        <button
                                            onClick={() => handleDeleteItem(selectedItem.id)}
                                            className="w-full py-3 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-900/40 transition mt-1"
                                        >
                                            <Trash2 size={16} /> Usuń ogłoszenie
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* FAB (Floating Action Button) do szybkiego aparatu/oferty */}
            <button onClick={() => setIsModalOpen(true)} className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(59,130,246,0.5)] z-40 transition transform active:scale-95">
                <Plus size={30} strokeWidth={3} />
            </button>

            {/* Modal "Vinted Pro" */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-end sm:items-center p-0">
                    <div className="bg-surface border border-gray-700 w-full h-full sm:h-auto sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl sm:rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white">Wystaw Przedmiot</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition bg-background p-1 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddItem} className="p-6 flex flex-col gap-4 overflow-y-auto flex-1 pb-[calc(env(safe-area-inset-bottom)+2rem)]">

                            <div className="bg-background border-2 border-dashed border-gray-700 rounded-xl relative overflow-hidden min-h-[120px]">
                                <MediaUploader
                                    module="rewear"
                                    onUploadSuccess={(url) => setNewItemPhotoUrl(url)}
                                />
                                {newItemPhotoUrl && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        <img src={newItemPhotoUrl} alt="Preview" className="w-full h-full object-cover opacity-30" />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Tytuł ogłoszenia</label>
                                <input
                                    type="text" placeholder="np. Bluza Szkolna, stan bdb!" required
                                    className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary font-bold"
                                    value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Opis przedmiotu</label>
                                <textarea
                                    required rows={3} placeholder="Opisz dokładnie swój przedmiot..."
                                    className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary resize-none text-sm"
                                    value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)}
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
                                {uploading ? 'Wysyłanie na serwer...' : 'Dodać Ogłoszenie'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
