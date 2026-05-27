import React, { useState } from 'react'
import { X, Shield, UserX, Loader2, ChevronDown } from 'lucide-react'
import { updateMemberRole, removeMember } from '../services/tebtalkQueries'
import { ImageKitService } from '../../../services/imageKitService'

const AVAILABLE_ROLES = [
    { value: 'admin', label: 'Administrator', color: 'text-secondary', desc: 'Pełny dostęp do ustawień grupy' },
    { value: 'moderator', label: 'Moderator', color: 'text-blue-400', desc: 'Może zarządzać wiadomościami' },
    { value: 'member', label: 'Uczestnik', color: 'text-gray-300', desc: 'Podstawowy członek grupy' },
    { value: 'muted', label: 'Wyciszony', color: 'text-gray-500', desc: 'Nie może wysyłać wiadomości' },
]

const ROLE_HIERARCHY = { owner: 0, admin: 1, moderator: 2, member: 3, muted: 4, banned: 5 }

function canManageRole(currentUserRole, targetRole) {
    // Only owner and admin can manage roles
    if (currentUserRole === 'owner') return true
    if (currentUserRole === 'admin') {
        // Admin can manage everyone except owners and other admins
        return targetRole !== 'owner' && targetRole !== 'admin'
    }
    return false
}

/**
 * RoleManager — displays role details for a specific member and allows
 * admins/owners to change roles or remove the member from the group.
 *
 * Props:
 *   member: object         — the member to manage { user_id, role, nickname, profiles }
 *   currentUserId: string  — current user's id
 *   currentUserRole: string — current user's role in the group
 *   groupId: string        — group id for API calls
 *   onRoleChanged: () => void   — callback after successful role update
 *   onMemberRemoved: () => void — callback after member removal
 *   onClose: () => void         — close the role manager
 */
export default function RoleManager({ member, currentUserId, currentUserRole, groupId, onRoleChanged, onMemberRemoved, onClose }) {
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [error, setError] = useState('')

    if (!member) return null

    const isCurrentUser = member.user_id === currentUserId
    const canManage = canManageRole(currentUserRole, member.role)
    const isOwnerOrAdmin = currentUserRole === 'owner' || currentUserRole === 'admin'
    const displayName = member.nickname || member.profiles?.full_name || 'Użytkownik'
    const avatarUrl = member.profiles?.avatar_url

    async function handleRoleChange(newRole) {
        if (!canManage || saving || removing) return
        setSaving(true)
        setError('')

        const { error: changeErr } = await updateMemberRole(groupId, member.user_id, newRole)
        if (changeErr) {
            setError('Nie udało się zmienić roli.')
            setSaving(false)
            return
        }

        setSaving(false)
        onRoleChanged?.()
    }

    async function handleRemove() {
        if (!isOwnerOrAdmin || saving || removing) return
        if (!window.confirm(`Usunąć ${displayName} z grupy?`)) return

        setRemoving(true)
        setError('')

        const { error: removeErr } = await removeMember(groupId, member.user_id)
        if (removeErr) {
            setError('Nie udało się usunąć członka.')
            setRemoving(false)
            return
        }

        setRemoving(false)
        onMemberRemoved?.()
    }

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[130] flex items-center justify-center p-4">
            <div className="bg-surface border border-gray-700 w-full max-w-xs rounded-2xl p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition"
                    aria-label="Zamknij"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold shrink-0">
                        {avatarUrl ? (
                            <img src={ImageKitService.getOptimizedUrl(avatarUrl, 80)} alt="" className="w-full h-full object-cover" />
                        ) : (
                            (displayName.charAt(0) || '?')
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-base font-bold text-white truncate">
                            {displayName}
                        </div>
                        <div className="text-[11px] text-gray-500 capitalize">
                            Obecna rola: {member.role}
                        </div>
                    </div>
                </div>

                {isCurrentUser ? (
                    <div className="text-sm text-gray-500 text-center py-4 bg-background rounded-xl border border-gray-800">
                        Nie możesz zmienić własnej roli.
                    </div>
                ) : canManage ? (
                    <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">
                            Zmień rolę
                        </label>
                        {AVAILABLE_ROLES.map(role => {
                            const isActive = member.role === role.value
                            const isHigherRank = ROLE_HIERARCHY[role.value] < ROLE_HIERARCHY[member.role]
                            return (
                                <button
                                    key={role.value}
                                    onClick={() => handleRoleChange(role.value)}
                                    disabled={isActive || saving}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                                        isActive
                                            ? 'bg-gray-800/50 border-gray-700 cursor-default'
                                            : 'bg-background border-gray-800 hover:border-gray-600 cursor-pointer'
                                    } disabled:opacity-60`}
                                >
                                    <Shield size={16} className={role.color} />
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                            {role.label}
                                            {isActive && ' (obecna)'}
                                        </div>
                                        <div className="text-[10px] text-gray-500">{role.desc}</div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-sm text-gray-500 text-center py-4 bg-background rounded-xl border border-gray-800">
                        Nie masz uprawnień do zarządzania tym użytkownikiem.
                    </div>
                )}

                {error && (
                    <div className="text-xs text-red-400 mt-3 text-center">{error}</div>
                )}

                {isOwnerOrAdmin && !isCurrentUser && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                        <button
                            onClick={handleRemove}
                            disabled={saving || removing}
                            className="w-full py-2.5 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-900/40 transition disabled:opacity-50"
                        >
                            {removing ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <UserX size={16} />
                            )}
                            {removing ? 'Usuwanie...' : 'Usuń z grupy'}
                        </button>
                    </div>
                )}

                {saving && (
                    <div className="flex items-center justify-center gap-2 mt-3 text-sm text-gray-400">
                        <Loader2 size={14} className="animate-spin" />
                        Zapisywanie...
                    </div>
                )}
            </div>
        </div>
    )
}
