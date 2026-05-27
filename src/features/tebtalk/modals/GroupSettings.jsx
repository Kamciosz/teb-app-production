import React, { useState } from 'react'
import { X, Plus, Settings, LogOut, Loader2, Pencil } from 'lucide-react'
import { addMember, updateGroup, leaveGroup as leaveGroupQuery } from '../services/tebtalkQueries'
import { ImageKitService } from '../../../services/imageKitService'
import { sanitizePlainText } from '../../../utils/safeContent'
import MemberList from './MemberList'
import RoleManager from './RoleManager'

/**
 * GroupSettings — modal for viewing/editing a chat group's settings.
 *
 * Integrates MemberList (members display), AddMember (sub-modal for adding
 * friends), RoleManager (per-member role change), group name editing, and
 * leave group action.
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   groupMembers: Array<{ user_id, role, nickname, profiles }>
 *   friends: Array<{ id, full_name, avatar_url }>
 *   currentUserId: string
 *   currentUserRole: string      — current user's role in this group
 *   groupId: string
 *   groupName: string            — current group name
 *   groupImageUrl: string        — current group image URL
 *   onGroupUpdated: () => void   — called after group name/image update
 *   onMemberAdded: () => void    — called after member is added (refreshes member list)
 *   onRoleChanged: () => void    — called after a role is changed
 *   onMemberRemoved: () => void  — called after a member is removed
 *   onLeaveGroup: () => void     — called after current user leaves the group
 *   toast: { success, error }    — toast notification helpers
 *   initialTab: string           — 'members' | 'settings' (default: 'members')
 */
export default function GroupSettings({
    isOpen,
    onClose,
    groupMembers = [],
    friends = [],
    currentUserId,
    currentUserRole = 'member',
    groupId,
    groupName: initialGroupName = '',
    groupImageUrl = '',
    onGroupUpdated,
    onMemberAdded,
    onRoleChanged,
    onMemberRemoved,
    onLeaveGroup,
    toast,
    initialTab = 'members',
}) {
    const [tab, setTab] = useState(initialTab)
    const [showAddMember, setShowAddMember] = useState(false)
    const [roleManagerTarget, setRoleManagerTarget] = useState(null)

    // Group edit state
    const [editingName, setEditingName] = useState(false)
    const [editName, setEditName] = useState(initialGroupName)
    const [savingName, setSavingName] = useState(false)

    if (!isOpen) return null

    // Determine if current user can manage the group
    const canManage = currentUserRole === 'owner' || currentUserRole === 'admin'
    const myMember = groupMembers.find(m => m.user_id === currentUserId)

    // --- Group name editing ---
    async function handleSaveName() {
        const trimmed = editName.trim()
        if (!trimmed || trimmed === initialGroupName) {
            setEditingName(false)
            return
        }
        if (trimmed.length > 120) {
            toast?.error('Nazwa grupy jest za długa (max 120 znaków).')
            return
        }

        setSavingName(true)
        const { error } = await updateGroup(groupId, { name: trimmed })
        setSavingName(false)

        if (error) {
            toast?.error('Nie udało się zapisać nazwy.')
            return
        }

        setEditingName(false)
        toast?.success('Nazwa grupy zaktualizowana.')
        onGroupUpdated?.()
    }

    // --- Add member ---
    async function handleAddMember(userId) {
        const { error } = await addMember(groupId, userId)
        if (error) {
            toast?.error('Nie udało się dodać użytkownika.')
            return
        }
        setShowAddMember(false)
        toast?.success('Użytkownik dodany!')
        onMemberAdded?.()
    }

    // --- Leave group ---
    async function handleLeaveGroup() {
        if (!window.confirm('Czy na pewno chcesz opuścić tę grupę?')) return

        const { error } = await leaveGroupQuery(groupId, currentUserId)
        if (error) {
            toast?.error('Nie udało się opuścić grupy.')
            return
        }
        onLeaveGroup?.()
        onClose()
    }

    // Members not in the group (for adding)
    const nonMemberFriends = friends.filter(f => !groupMembers.find(m => m.user_id === f.id))

    const isOwner = currentUserRole === 'owner'
    const isAdmin = currentUserRole === 'admin'

    return (
        <>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden">
                    <div className="px-6 pt-6 pb-0">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition"
                            aria-label="Zamknij"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Settings className="text-secondary" size={20} />
                            Ustawienia Grupy
                        </h3>

                        {/* Tabs */}
                        <div className="flex gap-1 mb-5 bg-gray-900 rounded-xl p-1">
                            <button
                                onClick={() => setTab('members')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                                    tab === 'members'
                                        ? 'bg-gray-700 text-white shadow'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                Członkowie ({groupMembers.length})
                            </button>
                            {canManage && (
                                <button
                                    onClick={() => setTab('settings')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                                        tab === 'settings'
                                            ? 'bg-gray-700 text-white shadow'
                                            : 'text-gray-500 hover:text-gray-300'
                                    }`}
                                >
                                    Ustawienia
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="px-6 pb-6 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-none">
                        {/* === MEMBERS TAB === */}
                        {tab === 'members' && (
                            <>
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                                        Członkowie ({groupMembers.length})
                                    </label>
                                    <button
                                        onClick={() => setShowAddMember(true)}
                                        className="text-xs text-secondary font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <Plus size={12} /> Dodaj znajomego
                                    </button>
                                </div>

                                <MemberList
                                    members={groupMembers}
                                    currentUserId={currentUserId}
                                    onMemberClick={canManage ? (m) => {
                                        if (m.user_id !== currentUserId) {
                                            setRoleManagerTarget(m)
                                        }
                                    } : undefined}
                                    maxHeight="max-h-60"
                                />

                                {/* Leave group */}
                                <div className="pt-3 border-t border-gray-800">
                                    <button
                                        onClick={handleLeaveGroup}
                                        className="w-full py-3 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-900/40 transition"
                                    >
                                        <LogOut size={16} /> Opuść grupę
                                    </button>
                                </div>
                            </>
                        )}

                        {/* === SETTINGS TAB (admin/owner only) === */}
                        {tab === 'settings' && (
                            <>
                                {/* Group name */}
                                <div>
                                    <label className="text-[10px] text-gray-500 font-bold uppercase mb-1.5 block">
                                        Nazwa grupy
                                    </label>
                                    {editingName ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value.slice(0, 120))}
                                                maxLength={120}
                                                autoFocus
                                                className="flex-1 p-2.5 bg-background border border-gray-700 rounded-xl text-white text-sm outline-none focus:border-secondary"
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveName()
                                                    if (e.key === 'Escape') {
                                                        setEditName(initialGroupName)
                                                        setEditingName(false)
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={handleSaveName}
                                                disabled={savingName || !editName.trim()}
                                                className="px-4 py-2 bg-secondary text-black font-bold rounded-xl text-sm disabled:opacity-50"
                                            >
                                                {savingName ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    'Zapisz'
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => {
                                                setEditName(initialGroupName)
                                                setEditingName(true)
                                            }}
                                            className="flex items-center gap-2 p-2.5 bg-background border border-gray-800 rounded-xl cursor-pointer hover:border-gray-600 transition group"
                                        >
                                            <span className="flex-1 text-sm text-white font-medium">
                                                {initialGroupName}
                                            </span>
                                            <Pencil size={14} className="text-gray-500 opacity-0 group-hover:opacity-100 transition" />
                                        </div>
                                    )}
                                </div>

                                {/* Group image (placeholder for future) */}
                                <div>
                                    <label className="text-[10px] text-gray-500 font-bold uppercase mb-1.5 block">
                                        Zdjęcie grupy
                                    </label>
                                    <div className="flex items-center gap-3 p-2.5 bg-background border border-gray-800 rounded-xl">
                                        <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center shrink-0">
                                            {groupImageUrl ? (
                                                <img src={ImageKitService.getOptimizedUrl(groupImageUrl, 80)} alt="" className="w-full h-full object-cover rounded-xl" />
                                            ) : (
                                                <Settings size={20} className="text-gray-600" />
                                            )}
                                        </div>
                                        <div className="flex-1 text-xs text-gray-500">
                                            {groupImageUrl ? 'Kliknij, aby zmienić' : 'Brak zdjęcia grupy'}
                                            <div className="text-[10px] mt-0.5">Wkrótce: możliwość zmiany</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Member count + roles summary */}
                                <div className="bg-background border border-gray-800 rounded-xl p-3 space-y-2">
                                    <div className="text-[10px] text-gray-500 font-bold uppercase">Podsumowanie</div>
                                    <div className="text-xs text-gray-400">
                                        <span className="text-amber-400 font-bold">
                                            {groupMembers.filter(m => m.role === 'owner').length}
                                        </span> owner ·{' '}
                                        <span className="text-secondary font-bold">
                                            {groupMembers.filter(m => m.role === 'admin').length}
                                        </span> admin ·{' '}
                                        <span className="text-blue-400 font-bold">
                                            {groupMembers.filter(m => m.role === 'moderator').length}
                                        </span> moderator ·{' '}
                                        <span className="text-gray-300 font-bold">
                                            {groupMembers.filter(m => m.role === 'member' || !m.role).length}
                                        </span> członkowie ·{' '}
                                        <span className="text-gray-500 font-bold">
                                            {groupMembers.filter(m => m.role === 'muted').length}
                                        </span> wyciszeni
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Member sub-modal */}
            {showAddMember && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[120] flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-xs rounded-2xl p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowAddMember(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition"
                            aria-label="Zamknij"
                        >
                            <X size={20} />
                        </button>
                        <h4 className="text-lg font-bold text-white mb-4">Dodaj do grupy</h4>

                        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-none">
                            {nonMemberFriends.length === 0 ? (
                                <p className="text-center text-gray-500 text-sm py-4">
                                    Nie masz jeszcze zaakceptowanych znajomych,<br />
                                    którzy nie są już w tej grupie.
                                </p>
                            ) : (
                                nonMemberFriends.map(friend => (
                                    <div
                                        key={friend.id}
                                        onClick={() => handleAddMember(friend.id)}
                                        className="flex items-center gap-3 p-3 bg-background border border-gray-800 rounded-xl cursor-pointer hover:border-secondary transition"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs shrink-0">
                                            {friend.avatar_url ? (
                                                <img src={ImageKitService.getOptimizedUrl(friend.avatar_url, 80)} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                friend.full_name?.charAt(0) || '?'
                                            )}
                                        </div>
                                        <div className="text-sm font-bold text-white">{friend.full_name}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Role Manager sub-modal (nested) */}
            {roleManagerTarget && (
                <RoleManager
                    member={roleManagerTarget}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    groupId={groupId}
                    onRoleChanged={() => {
                        setRoleManagerTarget(null)
                        onRoleChanged?.()
                    }}
                    onMemberRemoved={() => {
                        setRoleManagerTarget(null)
                        onMemberRemoved?.()
                    }}
                    onClose={() => setRoleManagerTarget(null)}
                />
            )}
        </>
    )
}
