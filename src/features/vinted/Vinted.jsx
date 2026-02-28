import React, { useEffect, useState } from 'react'
import { Plus, Search, PackageOpen } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Vinted() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

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
                        <div key={item.id} className="bg-surface rounded-xl overflow-hidden border border-gray-800 flex flex-col cursor-pointer hover:border-primary/50 transition">
                            <div className="h-32 bg-gray-900 flex items-center justify-center">
                                <PackageOpen size={40} className="text-gray-600" />
                            </div>
                            <div className="p-3">
                                <h3 className="text-sm text-gray-100 font-medium mb-1 line-clamp-2">{item.title}</h3>
                                <div className="text-primary font-bold">{item.price} PLN</div>
                                <div className="text-xs text-gray-500 mt-2 truncate">Od: {item.profiles?.full_name}</div>
                            </div>
                        </div>
                    ))}
                    {items.length === 0 && (
                        <div className="col-span-2 text-center py-10 text-gray-500">
                            Nikt obecnie nic nie sprzedaje na korytarzu.
                        </div>
                    )}
                </div>
            )}

            {/* FAB (Floating Action Button) do szybkiego aparatu/oferty */}
            <button className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-black rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(0,255,136,0.4)] z-40 transition transform active:scale-90">
                <Plus size={28} />
            </button>
        </div>
    )
}
