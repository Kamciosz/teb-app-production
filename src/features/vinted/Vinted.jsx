import React, { useEffect, useState } from 'react'
import { Plus, X, Search } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Vinted() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)

    // Stany formularza modal
    const [newItemTitle, setNewItemTitle] = useState('')
    const [newItemPrice, setNewItemPrice] = useState('')

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
        if (!newItemTitle || !newItemPrice) return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { error } = await supabase.from('vinted_items').insert([
            { seller_id: session.user.id, title: newItemTitle, price: parseFloat(newItemPrice) || 0 }
        ])

        if (error) {
            alert("Błąd integracji z rynkiem: " + error.message)
        } else {
            setIsModalOpen(false)
            setNewItemTitle('')
            setNewItemPrice('')
            fetchItems()
        }
    }

    return (
        <div className="relative min-h-[80vh] pb-10">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-primary">Szkolny Ryneczek</h2>
                <Search className="text-gray-400" />
            </div>

            {loading ? (
                <div className="text-center text-gray-500">Przeszukiwanie szkolnych plecaków...</div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    {items.map(item => (
                        <div key={item.id} className="bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                            <div className="h-32 bg-gray-800 flex items-center justify-center relative">
                                <span className="text-gray-600 font-bold">Brak Zdj.</span>
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-secondary font-bold">
                                    BETA
                                </div>
                            </div>
                            <div className="p-3">
                                <div className="font-bold text-white text-sm truncate">{item.title}</div>
                                <div className="text-xs text-gray-500 mb-2 truncate">Sprzed. {item.profiles?.full_name}</div>
                                <div className="text-lg font-bold text-primary">{item.price} PLN</div>
                            </div>
                        </div>
                    ))}

                    {items.length === 0 && <div className="col-span-2 text-center text-gray-500 mt-10">Brak ofert. Sprzedaj coś!</div>}
                </div>
            )}

            {/* FAB (Floating Action Button) do szybkiego aparatu/oferty */}
            <button onClick={() => setIsModalOpen(true)} className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-black rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(59,130,246,0.4)] z-40 transition transform active:scale-90">
                <Plus size={28} />
            </button>

            {/* Modal do Wystawiania przedmiotu */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-white mb-4">Wystaw na Rynek</h3>
                        <form onSubmit={handleAddItem} className="flex flex-col gap-4">
                            <input
                                type="text" placeholder="Co sprzedajesz? (np. Fiszki Niemiecki)" required
                                className="p-3 border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary"
                                value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)}
                            />
                            <div className="relative">
                                <input
                                    type="number" step="0.01" placeholder="Cena PLN" required
                                    className="p-3 w-full border border-gray-700 bg-background rounded-xl text-white outline-none focus:border-primary"
                                    value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="bg-primary text-white font-bold py-3 rounded-xl mt-2 transition active:scale-95 shadow-[0_0_10px_rgba(59,130,246,0.4)]">
                                + Dodaj Ogłoszenie
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
