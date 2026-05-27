import React, { useState } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import { createGroup } from '../services/tebtalkQueries'

const MAX_CHAT_GROUP_NAME = 120

/**
 * CreateGroup — modal for creating a new chat group.
 *
 * Props:
 *   isOpen: boolean       — show/hide the modal
 *   onClose: () => void   — close handler
 *   onCreated: () => void — called after successful creation (refreshes chat list)
 *   myId: string          — current user's id
 */
export default function CreateGroup({ isOpen, onClose, onCreated, myId }) {
    const [groupName, setGroupName] = useState('')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')

    if (!isOpen) return null

    async function handleCreate() {
        const trimmed = groupName.trim()
        if (!trimmed) return
        if (trimmed.length > MAX_CHAT_GROUP_NAME) {
            setError(`Nazwa grupy jest za długa (max ${MAX_CHAT_GROUP_NAME} znaków).`)
            return
        }

        setCreating(true)
        setError('')

        const { group, error: createErr } = await createGroup(trimmed, myId)
        if (createErr || !group) {
            setError(createErr?.message || 'Błąd tworzenia grupy.')
            setCreating(false)
            return
        }

        setCreating(false)
        setGroupName('')
        onCreated?.()
        onClose()
    }

    function handleClose() {
        setGroupName('')
        setError('')
        onClose()
    }

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition"
                    aria-label="Zamknij"
                >
                    <X size={20} />
                </button>

                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2 tracking-tight">
                    Nowa Grupa
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">
                            Nazwa Grupy
                        </label>
                        <input
                            type="text"
                            placeholder="np. Giełda 4A..."
                            value={groupName}
                            onChange={e => {
                                setGroupName(e.target.value.slice(0, MAX_CHAT_GROUP_NAME))
                                setError('')
                            }}
                            maxLength={MAX_CHAT_GROUP_NAME}
                            className="w-full mt-1 p-3 bg-background border border-gray-800 rounded-xl text-white outline-none focus:border-secondary transition"
                            autoFocus
                            disabled={creating}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !creating && groupName.trim()) {
                                    handleCreate()
                                }
                            }}
                        />
                        {error && (
                            <p className="text-xs text-red-400 mt-1 ml-1">{error}</p>
                        )}
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={!groupName.trim() || creating}
                        className="w-full py-3 bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition"
                    >
                        {creating ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Plus size={18} />
                        )}
                        {creating ? 'Tworzenie...' : 'Stwórz Pokój'}
                    </button>
                </div>

                <p className="text-[10px] text-gray-600 mt-4 text-center">
                    Wiadomości w grupach są publiczne dla każdego,{' '}
                    <br />kto zna identyfikator pokoju.
                </p>
            </div>
        </div>
    )
}
