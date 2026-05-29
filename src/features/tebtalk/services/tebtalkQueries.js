// --- TEBtalk Supabase queries ---
// All database operations extracted from the monolithic TEBtalk.jsx
// into a single service module.

import { supabase } from '../../../services/supabase'
import { WordFilter } from '../../../services/wordFilter'
import { sanitizeImageUrl, sanitizePlainText } from '../../../utils/safeContent'

// ============================================================
// Blocks
// ============================================================

/**
 * Fetch both lists: users I blocked and users who blocked me.
 */
export async function fetchBlocks(userId) {
    const [{ data: myBlocks }, { data: blockedMe }] = await Promise.all([
        supabase.from('user_blocks').select('blocked_user_id').eq('blocking_user_id', userId),
        supabase.from('user_blocks').select('blocking_user_id').eq('blocked_user_id', userId),
    ])

    const blocked = (myBlocks || []).map(row => row.blocked_user_id)
    const blockedBy = (blockedMe || []).map(row => row.blocking_user_id)

    return { blocked, blockedBy }
}

// ============================================================
// Friends
// ============================================================

/**
 * Fetch accepted friends, filtering out blocked users.
 */
export async function fetchFriends(userId, blockState = null) {
    const blocked = new Set(blockState?.blocked || [])
    const blockedBy = new Set(blockState?.blockedBy || [])

    const { data } = await supabase
        .from('friends')
        .select(`
            friend_id,
            profiles!friends_friend_id_fkey (id, full_name, avatar_url, role)
        `)
        .eq('user_id', userId)
        .eq('status', 'accepted')

    if (data) {
        return data
            .map(f => f.profiles)
            .filter(friend => friend && !blocked.has(friend.id) && !blockedBy.has(friend.id))
    }

    // Fallback: profiles query if JOIN fails
    const { data: fallbackFriends } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted')

    const friendIds = (fallbackFriends || []).map(f => f.friend_id).filter(Boolean)
    if (!friendIds.length) return []

    const { data: fallbackProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', friendIds)

    return (fallbackProfiles || []).filter(
        friend => friend && !blocked.has(friend.id) && !blockedBy.has(friend.id)
    )
}

// ============================================================
// Group Members
// ============================================================

/**
 * Fetch members of a chat group with their roles and profiles.
 */
export async function fetchGroupMembers(groupId) {
    const { data, error } = await supabase
        .from('chat_group_members')
        .select(`
            user_id,
            role,
            nickname,
            profiles (full_name, avatar_url)
        `)
        .eq('group_id', groupId)

    if (error) {
        console.error('Błąd pobierania członków grupy:', error)
        return []
    }

    return (data || []).map(member => ({
        ...member,
        nickname: sanitizePlainText(member.nickname, { maxLength: 80 }),
        profiles: {
            full_name:
                sanitizePlainText(member.profiles?.full_name, { maxLength: 80 }) || 'Użytkownik',
            avatar_url: sanitizeImageUrl(member.profiles?.avatar_url),
        },
    }))
}

// ============================================================
// Recent Chats
// ============================================================

/**
 * Load recent DMs + groups for the sidebar/chat list.
 * scanLimit: how many recent DMs to scan per direction (default 300).
 */
export async function fetchRecentChats(userId, blockState = null, scanLimit = 300) {
    const blocked = new Set(blockState?.blocked || [])
    const blockedBy = new Set(blockState?.blockedBy || [])

    // 1. Private DMs — scan recent messages
    const [{ data: sentMsg }, { data: recvMsg }] = await Promise.all([
        supabase
            .from('direct_messages')
            .select('receiver_id')
            .eq('sender_id', userId)
            .order('created_at', { ascending: false })
            .limit(scanLimit),
        supabase
            .from('direct_messages')
            .select('sender_id')
            .eq('receiver_id', userId)
            .order('created_at', { ascending: false })
            .limit(scanLimit),
    ])

    const userIds = new Set([
        ...(sentMsg || []).map(m => m.receiver_id).filter(id => id && id.length > 20),
        ...(recvMsg || []).map(m => m.sender_id).filter(id => id && id.length > 20),
    ])

    let chats = []
    if (userIds.size > 0) {
        const primaryUsers = await supabase
            .from('profiles')
            .select('id, full_name, role, avatar_url')
            .in('id', Array.from(userIds))
        const users = primaryUsers.data || []

        if (users) {
            chats = users
                .filter(u => !blocked.has(u.id) && !blockedBy.has(u.id))
                .map(u => ({ ...u, type: 'private' }))
        }
    }

    // 2. Groups I belong to
    const { data: myGroups } = await supabase
        .from('chat_group_members')
        .select('group_id, chat_groups(id, name, image_url)')
        .eq('user_id', userId)

    if (myGroups) {
        const groups = myGroups.map(g => ({
            id: g.chat_groups.id,
            full_name: g.chat_groups.name,
            avatar_url: g.chat_groups.image_url,
            type: 'group',
            role: 'room',
        }))
        chats = [...chats, ...groups]
    }

    return chats
}

// ============================================================
// Messages — Fetch
// ============================================================

/**
 * Fetch messages for a DM or group chat.
 * Returns chronological array and a hasMore flag.
 */
export async function fetchMessages(myId, partnerId, isGroup = false, limit = 120) {
    let data, error

    if (isGroup) {
        const result = await supabase
            .from('chat_group_messages')
            .select('*')
            .eq('group_id', partnerId)
            .order('created_at', { ascending: false })
            .limit(limit)
        data = result.data
        error = result.error
    } else {
        // Two separate .eq() queries instead of .or() with string interpolation
        const [{ data: data1 }, { data: data2 }] = await Promise.all([
            supabase
                .from('direct_messages')
                .select('*')
                .eq('sender_id', myId)
                .eq('receiver_id', partnerId)
                .order('created_at', { ascending: false })
                .limit(limit),
            supabase
                .from('direct_messages')
                .select('*')
                .eq('sender_id', partnerId)
                .eq('receiver_id', myId)
                .order('created_at', { ascending: false })
                .limit(limit),
        ])

        // Merge, deduplicate by id, sort chronologically desc
        const seen = new Set()
        const merged = []
        for (const msg of [...(data1 || []), ...(data2 || [])]) {
            if (!seen.has(msg.id)) {
                seen.add(msg.id)
                merged.push(msg)
            }
        }
        merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        data = merged.slice(0, limit)
    }

    if (error) {
        console.error('Błąd pobierania wiadomości:', error)
        return { messages: null, error, hasMore: false }
    }

    const chronological = [...(data || [])].reverse()
    return {
        messages: chronological,
        error: null,
        hasMore: data?.length >= limit,
    }
}

/**
 * Fetch older messages (pagination, targeting messages before the oldest).
 */
export async function loadOlderMessages(myId, oldestMessageCreatedAt, partnerId, isGroup = false, limit = 80) {
    let data, error

    if (isGroup) {
        const result = await supabase
            .from('chat_group_messages')
            .select('*')
            .eq('group_id', partnerId)
            .lt('created_at', oldestMessageCreatedAt)
            .order('created_at', { ascending: false })
            .limit(limit)
        data = result.data
        error = result.error
    } else {
        // Two separate .eq() queries instead of .or() with string interpolation
        const [{ data: data1 }, { data: data2 }] = await Promise.all([
            supabase
                .from('direct_messages')
                .select('*')
                .eq('sender_id', myId)
                .eq('receiver_id', partnerId)
                .lt('created_at', oldestMessageCreatedAt)
                .order('created_at', { ascending: false })
                .limit(limit),
            supabase
                .from('direct_messages')
                .select('*')
                .eq('sender_id', partnerId)
                .eq('receiver_id', myId)
                .lt('created_at', oldestMessageCreatedAt)
                .order('created_at', { ascending: false })
                .limit(limit),
        ])

        // Merge, deduplicate by id, sort chronologically desc
        const seen = new Set()
        const merged = []
        for (const msg of [...(data1 || []), ...(data2 || [])]) {
            if (!seen.has(msg.id)) {
                seen.add(msg.id)
                merged.push(msg)
            }
        }
        merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        data = merged.slice(0, limit)
    }

    if (error) {
        console.error('Błąd pobierania starszych wiadomości:', error)
        return { messages: null, error, hasMore: false }
    }

    const chronological = [...(data || [])].reverse()
    return {
        messages: chronological,
        error: null,
        hasMore: chronological.length >= limit,
    }
}

// ============================================================
// Messages — Send / Delete
// ============================================================

/**
 * Build the insert payload for a message (DM or group).
 */
function buildMessagePayload(myId, partnerId, content, isGroup) {
    const payload = {
        sender_id: myId,
        content: WordFilter.clean(content),
    }
    if (isGroup) payload.group_id = partnerId
    else payload.receiver_id = partnerId
    return payload
}

/**
 * Insert a message and return the server-confirmed row.
 */
export async function sendMessage(myId, activeChatUser, msgText) {
    const isGroup = activeChatUser.type === 'group'
    const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'
    const payload = buildMessagePayload(myId, activeChatUser.id, msgText, isGroup)

    const { data, error } = await supabase
        .from(tableName)
        .insert([payload])
        .select()
        .single()

    return { data, error }
}

/**
 * Send an image message (URL already uploaded).
 */
export async function sendImage(myId, activeChatUser, url) {
    const safeUrl = sanitizeImageUrl(url)
    if (!safeUrl) return { data: null, error: new Error('Invalid image URL') }

    const isGroup = activeChatUser.type === 'group'
    const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'
    const payload = buildMessagePayload(myId, activeChatUser.id, safeUrl, isGroup)

    const { data, error } = await supabase.from(tableName).insert([payload]).select()
    return { data, error }
}

/**
 * Soft-delete a message (set is_deleted = true, clear content).
 */
export async function deleteMessage(messageId, myId) {
    const { error } = await supabase
        .from('direct_messages')
        .update({ content: 'Wiadomość usunięta', is_deleted: true })
        .eq('id', messageId)
        .eq('sender_id', myId)

    return { error }
}

/**
 * Delete a group message.
 */
export async function deleteGroupMessage(messageId, myId) {
    const { error } = await supabase
        .from('chat_group_messages')
        .update({ content: 'Wiadomość usunięta', is_deleted: true })
        .eq('id', messageId)
        .eq('sender_id', myId)

    return { error }
}

// ============================================================
// Groups — Create / Manage
// ============================================================

/**
 * Create a new chat group.
 * 1. Insert chat_groups row
 * 2. Add creator as admin in chat_group_members
 * 3. Send a welcome message
 */
export async function createGroup(name, myId) {
    const cleanName = sanitizePlainText(name, { maxLength: 120 })
    if (!cleanName) return { group: null, error: new Error('Nazwa grupy jest wymagana.') }

    // 1. Create the group
    const { data: group, error: groupErr } = await supabase
        .from('chat_groups')
        .insert([{ name: cleanName, creator_id: myId }])
        .select()
        .single()

    if (groupErr || !group) {
        console.error(groupErr || 'No group data returned')
        return { group: null, error: groupErr || new Error('Błąd tworzenia grupy.') }
    }

    // 2. Add creator as admin
    await supabase
        .from('chat_group_members')
        .insert([{ group_id: group.id, user_id: myId, role: 'owner' }])

    // 3. Send welcome message
    await supabase.from('chat_group_messages').insert([{
        sender_id: myId,
        group_id: group.id,
        content: `Grupa ${cleanName} została utworzona!`,
    }])

    return { group, error: null }
}

/**
 * Add a user to a chat group as 'member'.
 */
export async function addMember(groupId, userId) {
    const { error } = await supabase
        .from('chat_group_members')
        .insert([{ group_id: groupId, user_id: userId, role: 'member' }])
    return { error }
}

// ============================================================
// Groups — Role Management
// ============================================================

/**
 * Update a member's role in a chat group.
 * Only admins/owners can change roles.
 */
export async function updateMemberRole(groupId, userId, newRole) {
    const { error } = await supabase
        .from('chat_group_members')
        .update({ role: newRole })
        .eq('group_id', groupId)
        .eq('user_id', userId)
    return { error }
}

/**
 * Remove a member from a chat group (kick/ban).
 */
export async function removeMember(groupId, userId) {
    const { error } = await supabase
        .from('chat_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
    return { error }
}

/**
 * Leave a chat group (current user removes themselves).
 */
export async function leaveGroup(groupId, userId) {
    const { error } = await supabase
        .from('chat_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
    return { error }
}

/**
 * Update a chat group's name or image.
 */
export async function updateGroup(groupId, updates) {
    const cleanUpdates = {}
    if (updates.name !== undefined) {
        cleanUpdates.name = sanitizePlainText(updates.name, { maxLength: 120 })
    }
    if (updates.image_url !== undefined) {
        cleanUpdates.image_url = sanitizeImageUrl(updates.image_url)
    }

    if (!Object.keys(cleanUpdates).length) return { error: new Error('Brak zmian do zapisania.') }

    const { error } = await supabase
        .from('chat_groups')
        .update(cleanUpdates)
        .eq('id', groupId)
    return { error }
}

// ============================================================
// Friends — Send Request
// ============================================================

/**
 * Send a friend request (inserts friends row with status 'pending').
 */
export async function sendFriendRequest(myId, friendId) {
    const { error } = await supabase
        .from('friends')
        .insert([{ user_id: myId, friend_id: friendId, status: 'pending' }])
    return { error }
}

// ============================================================
// Block / Unblock
// ============================================================

/**
 * Toggle block status for a user.
 */
export async function toggleBlockQuery(myId, userId, isCurrentlyBlocked) {
    if (isCurrentlyBlocked) {
        const { error } = await supabase
            .from('user_blocks')
            .delete()
            .eq('blocking_user_id', myId)
            .eq('blocked_user_id', userId)
        return { action: 'unblocked', error }
    }

    const { error } = await supabase
        .from('user_blocks')
        .insert([{ blocking_user_id: myId, blocked_user_id: userId }])
    return { action: 'blocked', error }
}

// ============================================================
// Search Profiles
// ============================================================

/**
 * Search for users by name (min 3 chars).
 */
export async function searchProfiles(query, myId, limit = 10) {
    if (!query || query.length < 3) return []
    const safeQuery = sanitizePlainText(query, { maxLength: 60 })

    const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, is_private')
        .ilike('full_name', `%${safeQuery}%`)
        .eq('is_private', false)
        .neq('id', myId)
        .limit(limit)

    return data || []
}

// ============================================================
// Helpers (plain functions, no side effects)
// ============================================================

/**
 * Normalize a profile object or partial object into a chat target.
 */
export function normalizePrivateTarget(target) {
    if (!target?.id) return null
    return {
        id: target.id,
        full_name: sanitizePlainText(target.full_name, { maxLength: 80 }) || 'Użytkownik',
        role: target.role || 'student',
        avatar_url: sanitizeImageUrl(target.avatar_url),
        dm_friends_only: false,
        type: 'private',
    }
}

/**
 * Check if a user is in a blocked relationship.
 */
export function isBlockedRelationship(userId, myBlockedIds, blockedByIds) {
    return myBlockedIds.includes(userId) || blockedByIds.includes(userId)
}

/**
 * Check if a user is in the accepted friends list.
 */
export function isAcceptedFriend(userId, friends) {
    return friends.some(friend => friend.id === userId)
}

/**
 * Append an incoming message with dedup and cap.
 */
export function appendIncomingMessage(prevMessages, incomingMessage, maxMessages = 300) {
    if (prevMessages.some(m => m.id === incomingMessage.id)) return prevMessages
    const merged = [...prevMessages, incomingMessage]
    return merged.slice(-maxMessages)
}
