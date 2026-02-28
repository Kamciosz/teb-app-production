import React, { useEffect, useState } from 'react'
import { Plus, X, Search, Filter, Camera, Tag } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Vinted() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)

    // Stany formularza modal "Vinted Pro"
    const [newItemTitle, setNewItemTitle] = useState('')
    const [newItemPrice, setNewItemPrice] = useState('')
    const [newItemDesc, setNewItemDesc] = useState('')
    const [newItemCategory, setNewItemCategory] = useState('Ubrania')
    const [newItemCondition, setNewItemCondition] = useState('Bardzo dobry')
    const [newItemSize, setNewItemSize] = useState('M')

    // Filtrowanie
    const [activeFilter, setActiveFilter] = useState('Wszystko')

    useEffect(() => {
        fetchItems()
    }, [])

    async function fetchItems() {
        const { data, error } = await supabase
            .from('vinted_items')
            .select('*, profiles(full_name)')
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

        // Uratowanie tabeli przed brakiem definicji zaawansowanych. Paczkujemy struktury Vinted do JSON
        const payload = JSON.stringify({
            title: newItemTitle,
            desc: newItemDesc,
            category: newItemCategory,
            condition: newItemCondition,
            size: newItemCategory === 'Ubrania' ? newItemSize : null
        })

        const { error } = await supabase.from('vinted_items').insert([
            { seller_id: session.user.id, title: payload, price: parseFloat(newItemPrice) || 0 }
        ])

        if (error) {
            alert("Błąd integracji z rynkiem. Jeśli Supabase zwraca 404, musisz dobudować tabele SQL!")
        } else {
            setIsModalOpen(false)
            setNewItemTitle('')
            setNewItemPrice('')
            setNewItemDesc('')
            fetchItems()
        }
    }

    const parseTitle = (rawTitle) => {
        try {
            return JSON.parse(rawTitle)
        } catch {
            return { title: rawTitle, desc: "Brak ustalonego opisu", category: "Inne", condition: "?", size: null }
        }
    }

    // Aplikacja Filtrów
    const filteredItems = items.filter(item => {
        if (activeFilter === 'Wszystko') return true;
        const parsed = parseTitle(item.title)
        return parsed.category === activeFilter;
    })

    return (
        <div className="relative min-h-[80vh] pb-10">
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">TEB Vinted</h2>
                <div className="bg-surface border border-gray-700 p-2 rounded-full flex gap-2">
                    <Search className="text-gray-400" size={20} />
                    <Filter className="text-primary" size={20} />
                </div>
            </div>

            {/* Pasek Filtrów */}
            <div className="flex overflow-x-auto gap-2 pb-4 px-2 scrollbar-none mb-2">
                {['Wszystko', 'Ubrania', 'Elektronika', 'Książki', 'Inne'].map(cat => (
                    <button
                        key={cat} onClick={() => setActiveFilter(cat)}
                        className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition ${activeFilter === cat ? 'bg-primary text-white shadow-[0_4px_10px_rgba(59,130,246,0.3)]' : 'bg-surface text-gray-400 border border-gray-800'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center text-gray-500 mt-10 animate-pulse">Przeszukiwanie szkolnych plecaków...</div>
            ) : (
                <div className="grid grid-cols-2 gap-3 px-1">
                    {filteredItems.map(item => {
                        const info = parseTitle(item.title)
                        return (
                            <div key={item.id} className="bg-surface border border-gray-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
                                <div className="h-40 bg-[#1a1a1a] flex flex-col items-center justify-center relative">
                                    <Camera className="text-gray-700 mb-2" size={32} />
                                    <span className="text-gray-600 font-bold text-xs">Aparat wyłączony</span>
                                    <div className="absolute top-2 right-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded text-[10px] text-white font-bold border border-gray-700 flex items-center gap-1">
                                        <Tag size={10} className="text-primary" /> {info.condition}
                                    </div>
                                    {info.size && (
                                        <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-[10px] text-white font-bold border border-gray-700">
                                            {info.size}
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 flex flex-col grow justify-between">
                                    <div>
                                        <div className="text-lg font-bold text-white leading-tight mb-1 truncate">{info.title}</div>
                                        <div className="text-xs text-gray-400 mb-2 truncate">{info.desc}</div>
                                    </div>
                                    <div className="flex justify-between items-end mt-2">
                                        <div className="text-xl font-bold text-primary">{item.price} PLN</div>
                                        <div className="text-[10px] text-gray-500 max-w-[50%] truncate text-right">{item.profiles?.full_name}</div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {filteredItems.length === 0 && <div className="col-span-2 text-center text-gray-500 mt-10 p-8 border border-gray-800 rounded-2xl border-dashed">Brak ofert w tej kategorii. Sprzedaj coś!</div>}
                </div>
            )}

            {/* FAB (Floating Action Button) do szybkiego aparatu/oferty */}
            <button onClick={() => setIsModalOpen(true)} className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(59,130,246,0.5)] z-40 transition transform active:scale-95">
                <Plus size={30} strokeWidth={3} />
            </button>

            {/* Modal "Vinted Pro" */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-md rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white">Wystaw Przedmiot</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition bg-background p-1 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddItem} className="p-6 flex flex-col gap-4 overflow-y-auto">

                            <div className="h-32 bg-background border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary transition group">
                                <Camera size={32} className="text-gray-500 group-hover:text-primary transition mb-2" />
                                <span className="text-xs font-bold text-gray-400 group-hover:text-primary transition">Dodaj do 5 zdjęć (Opcjonalnie)</span>
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
                                        <option>Inne</option>
                                    </select>
                                </div>
                                <div className="relative">
                                    <label className="text-xs text-gray-400 font-bold mb-1 block">Cena</label>
                                    <input
                                        type="number" step="0.01" placeholder="0.00" required
                                        className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary font-bold text-primary pl-12"
                                        value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                                    />
                                    <span className="absolute left-3 top-8 text-gray-500 font-bold pt-0.5">PLN</span>
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
                            </div>

                            <button type="submit" className="bg-primary text-white font-bold py-3 rounded-xl mt-4 transition active:scale-95 shadow-[0_4px_15px_rgba(59,130,246,0.3)] w-full">
                                Dodać Ogłoszenie
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
