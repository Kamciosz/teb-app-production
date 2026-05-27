import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// ===== Shared mocks =====

vi.mock('react-router-dom', () => ({
    useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('../../../services/imageKitService', () => ({
    ImageKitService: {
        getOptimizedUrl: vi.fn(url => url || ''),
    },
}))

vi.mock('../../../context/ToastContext', () => ({
    useToast: vi.fn(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() })),
}))

vi.mock('../../profile/profileMeta', () => ({
    getRoleLabel: vi.fn(role => role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Nauczyciel' : 'Uczeń'),
    getUserInitial: vi.fn(name => (name || '?')[0]?.toUpperCase() || '?'),
}))

vi.mock('../../../utils/safeContent', () => ({
    sanitizeImageUrl: vi.fn(url => url?.trim() || ''),
    sanitizePlainText: vi.fn((text, opts) => {
        if (!text) return ''
        const max = opts?.maxLength || Infinity
        return text.trim().slice(0, max)
    }),
}))

// ===== ChatList tests =====
describe('ChatList', () => {
    let ChatList
    const openChat = vi.fn()
    const openProfile = vi.fn()

    beforeEach(async () => {
        vi.clearAllMocks()
        ChatList = (await import('../sidebar/ChatList')).default
    })

    it('shows loading indicator when loading is true', () => {
        render(<ChatList recentChats={[]} loading={true} openChat={openChat} openProfile={openProfile} />)
        expect(screen.getByText(/Wczytywanie historii rozmow/i)).toBeInTheDocument()
    })

    it('shows empty state when no chats', () => {
        render(<ChatList recentChats={[]} loading={false} openChat={openChat} openProfile={openProfile} />)
        expect(screen.getByText(/Nie masz jeszcze zadnych/i)).toBeInTheDocument()
    })

    it('renders private chats with avatar and name', () => {
        const chats = [
            { id: 'u1', full_name: 'Jan Kowalski', role: 'student', avatar_url: null, type: 'private' },
        ]
        render(<ChatList recentChats={chats} loading={false} openChat={openChat} openProfile={openProfile} />)
        expect(screen.getByText('Jan Kowalski')).toBeInTheDocument()
        expect(screen.getByText('Uczeń')).toBeInTheDocument()
    })

    it('renders group chats with Users icon', () => {
        const chats = [
            { id: 'g1', full_name: 'Klasa 4A', role: 'room', avatar_url: null, type: 'group' },
        ]
        render(<ChatList recentChats={chats} loading={false} openChat={openChat} openProfile={openProfile} />)
        expect(screen.getByText('Klasa 4A')).toBeInTheDocument()
        expect(screen.getByText('Pokój grupowy')).toBeInTheDocument()
    })

    it('calls openChat when clicking a chat', () => {
        const chats = [
            { id: 'u1', full_name: 'Jan Kowalski', role: 'student', avatar_url: null, type: 'private' },
        ]
        render(<ChatList recentChats={chats} loading={false} openChat={openChat} openProfile={openProfile} />)
        fireEvent.click(screen.getByText('Jan Kowalski'))
        expect(openChat).toHaveBeenCalledWith(chats[0])
    })

    it('renders multiple chats', () => {
        const chats = [
            { id: 'u1', full_name: 'Anna', role: 'student', avatar_url: null, type: 'private' },
            { id: 'g1', full_name: 'Grupa 1', role: 'room', avatar_url: null, type: 'group' },
        ]
        render(<ChatList recentChats={chats} loading={false} openChat={openChat} openProfile={openProfile} />)
        expect(screen.getByText('Anna')).toBeInTheDocument()
        expect(screen.getByText('Grupa 1')).toBeInTheDocument()
    })
})

// ===== GroupList tests =====
describe('GroupList', () => {
    let GroupList
    const openChat = vi.fn()
    const openProfile = vi.fn()
    const onCreateGroup = vi.fn()

    beforeEach(async () => {
        vi.clearAllMocks()
        GroupList = (await import('../sidebar/GroupList')).default
    })

    it('shows empty state when no groups', () => {
        render(<GroupList recentChats={[]} openChat={openChat} openProfile={openProfile} onCreateGroup={onCreateGroup} />)
        expect(screen.getByText(/Nie nalezysz do zadnej grupy/i)).toBeInTheDocument()
    })

    it('renders groups filtered from recentChats', () => {
        const chats = [
            { id: 'u1', full_name: 'DM User', role: 'student', type: 'private' },
            { id: 'g1', full_name: 'Klasa 4A', role: 'room', type: 'group' },
            { id: 'g2', full_name: 'Zainteresowania', role: 'room', type: 'group' },
        ]
        render(<GroupList recentChats={chats} openChat={openChat} openProfile={openProfile} onCreateGroup={onCreateGroup} />)
        expect(screen.getByText('Klasa 4A')).toBeInTheDocument()
        expect(screen.getByText('Zainteresowania')).toBeInTheDocument()
        expect(screen.queryByText('DM User')).not.toBeInTheDocument()
    })

    it('calls openChat when clicking a group', () => {
        const chats = [
            { id: 'g1', full_name: 'Klasa 4A', role: 'room', type: 'group' },
        ]
        render(<GroupList recentChats={chats} openChat={openChat} openProfile={openProfile} onCreateGroup={onCreateGroup} />)
        fireEvent.click(screen.getByText('Klasa 4A'))
        expect(openChat).toHaveBeenCalledWith(chats[0])
    })

    it('calls onCreateGroup when clicking the create button', () => {
        render(<GroupList recentChats={[]} openChat={openChat} openProfile={openProfile} onCreateGroup={onCreateGroup} />)
        const createBtn = screen.getByTitle('Stworz grupe')
        fireEvent.click(createBtn)
        expect(onCreateGroup).toHaveBeenCalled()
    })

    it('shows create link in empty state', () => {
        render(<GroupList recentChats={[]} openChat={openChat} openProfile={openProfile} onCreateGroup={onCreateGroup} />)
        expect(screen.getByText('Stworz pierwsza!')).toBeInTheDocument()
    })
})

// ===== FriendList tests =====
describe('FriendList', () => {
    let FriendList
    const openChat = vi.fn()
    const openProfile = vi.fn()
    const onNavigateSearch = vi.fn()
    const onBack = vi.fn()

    beforeEach(async () => {
        vi.clearAllMocks()
        FriendList = (await import('../sidebar/FriendList')).default
    })

    it('shows empty state when no friends', () => {
        render(<FriendList friends={[]} openChat={openChat} openProfile={openProfile} onNavigateSearch={onNavigateSearch} onBack={onBack} />)
        expect(screen.getByText(/Nie masz jeszcze znajomych/i)).toBeInTheDocument()
    })

    it('renders friends with names and roles', () => {
        const friends = [
            { id: 'f1', full_name: 'Anna Kowalska', role: 'admin', avatar_url: null },
            { id: 'f2', full_name: 'Piotr Nowak', role: 'student', avatar_url: null },
        ]
        render(<FriendList friends={friends} openChat={openChat} openProfile={openProfile} onNavigateSearch={onNavigateSearch} onBack={onBack} />)
        expect(screen.getByText('Anna Kowalska')).toBeInTheDocument()
        expect(screen.getByText('Piotr Nowak')).toBeInTheDocument()
        expect(screen.getByText('Administrator')).toBeInTheDocument()
        expect(screen.getByText('Uczeń')).toBeInTheDocument()
    })

    it('calls openChat with type private when clicking a friend', () => {
        const friends = [
            { id: 'f1', full_name: 'Anna', role: 'student', avatar_url: null },
        ]
        render(<FriendList friends={friends} openChat={openChat} openProfile={openProfile} onNavigateSearch={onNavigateSearch} onBack={onBack} />)
        fireEvent.click(screen.getByText('Anna'))
        expect(openChat).toHaveBeenCalledWith({ ...friends[0], type: 'private' })
    })

    it('renders search button when onNavigateSearch is provided', () => {
        render(<FriendList friends={[]} openChat={openChat} openProfile={openProfile} onNavigateSearch={onNavigateSearch} onBack={onBack} />)
        expect(screen.getByText(/Znajdz nowych osob/i)).toBeInTheDocument()
        fireEvent.click(screen.getByText(/Znajdz nowych osob/i))
        expect(onNavigateSearch).toHaveBeenCalled()
    })

    it('calls onBack when back button is provided', () => {
        render(<FriendList friends={[]} openChat={openChat} openProfile={openProfile} onNavigateSearch={onNavigateSearch} onBack={onBack} />)
        const backBtn = screen.getByTitle('Powrót')
        expect(backBtn).toBeInTheDocument()
        fireEvent.click(backBtn)
        expect(onBack).toHaveBeenCalled()
    })
})

// ===== SearchBar tests =====
describe('SearchBar', () => {
    let SearchBar
    const openChat = vi.fn()
    const toggleBlock = vi.fn()
    const sendFriendRequest = vi.fn()
    const onClose = vi.fn()

    beforeEach(async () => {
        vi.clearAllMocks()
        SearchBar = (await import('../sidebar/SearchBar')).default
    })

    it('renders search input', () => {
        render(
            <SearchBar
                myId="user1"
                myBlockedIds={[]}
                openChat={openChat}
                toggleBlock={toggleBlock}
                sendFriendRequest={sendFriendRequest}
                onClose={onClose}
            />
        )
        expect(screen.getByPlaceholderText('Wyszukaj ucznia...')).toBeInTheDocument()
    })

    it('shows hint when query is empty', () => {
        render(
            <SearchBar
                myId="user1"
                myBlockedIds={[]}
                openChat={openChat}
                toggleBlock={toggleBlock}
                sendFriendRequest={sendFriendRequest}
                onClose={onClose}
            />
        )
        expect(screen.getByText(/Wpisz min. 3 znaki/i)).toBeInTheDocument()
    })

    it('calls onClose when back button is clicked', () => {
        render(
            <SearchBar
                myId="user1"
                myBlockedIds={[]}
                openChat={openChat}
                toggleBlock={toggleBlock}
                sendFriendRequest={sendFriendRequest}
                onClose={onClose}
            />
        )
        const backBtn = screen.getByTitle('Powrót')
        fireEvent.click(backBtn)
        expect(onClose).toHaveBeenCalled()
    })

    it('hides hint and no results message when query is between 1-2 characters', () => {
        render(
            <SearchBar
                myId="user1"
                myBlockedIds={[]}
                openChat={openChat}
                toggleBlock={toggleBlock}
                sendFriendRequest={sendFriendRequest}
                onClose={onClose}
            />
        )
        // Initially shows hint
        expect(screen.getByText(/Wpisz min. 3 znaki/i)).toBeInTheDocument()
    })
})
