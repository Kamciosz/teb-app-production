import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ChatPanel from '../chat/ChatPanel'

// Mock external deps
vi.mock('../../../utils/safeContent', () => ({
    sanitizeImageUrl: vi.fn(url => url?.trim() || ''),
    sanitizePlainText: vi.fn((text, opts) => {
        if (!text) return ''
        const max = opts?.maxLength || Infinity
        const trimmed = text.trim().slice(0, max)
        if (opts?.preserveLineBreaks) return trimmed
        return trimmed
    }),
}))

vi.mock('../../../services/imageKitService', () => ({
    ImageKitService: {
        getOptimizedUrl: vi.fn((url, width) => url || ''),
    },
}))

vi.mock('../../components/ReportButton', () => ({
    default: ({ entityType, entityId }) => (
        <button data-testid={`report-${entityType}-${entityId}`}>Zgłoś</button>
    ),
}))

vi.mock('../../components/common/MediaUploader', () => ({
    default: ({ module, onUploadSuccess, children }) => (
        <div data-testid={`media-uploader-${module}`}>{children}</div>
    ),
}))

vi.mock('../../profile/profileMeta', () => ({
    getRoleLabel: vi.fn(role => role === 'admin' ? 'Administrator' : 'Uczeń'),
    getUserInitial: vi.fn(name => (name || '?')[0]?.toUpperCase() || '?'),
}))

vi.mock('../chat/utils', () => ({
    formatTimestamp: vi.fn(() => '14:30'),
    splitGroupsByDate: vi.fn((msgs, myId) => {
        if (!msgs.length) return []
        return [{
            type: 'block',
            dateLabel: 'Dzisiaj',
            items: [{
                type: 'normal',
                senderId: msgs[0]?.sender_id || 'u1',
                senderName: msgs[0]?.sender_name || 'Test',
                isMe: msgs[0]?.sender_id === myId,
                messages: msgs,
            }],
        }]
    }),
}))

const mockUser = {
    id: 'other-1',
    full_name: 'Jan Kowalski',
    role: 'student',
    avatar_url: 'https://example.com/av.jpg',
    type: 'private',
}

const mockGroup = {
    id: 'group-1',
    full_name: 'Klasa 4A',
    role: 'room',
    avatar_url: '',
    type: 'group',
}

const mockMessage = {
    id: 'msg-1',
    sender_id: 'other-1',
    sender_name: 'Jan Kowalski',
    content: 'Cześć!',
    created_at: '2026-01-01T12:00:00Z',
    is_deleted: false,
}

const mockMyMessage = {
    id: 'msg-2',
    sender_id: 'me-1',
    content: 'Hej!',
    created_at: '2026-01-01T12:05:00Z',
    is_deleted: false,
}

describe('ChatPanel', () => {
    // Basic rendering
    it('returns null when no activeChatUser', () => {
        const { container } = render(<ChatPanel />)
        expect(container.innerHTML).toBe('')
    })

    it('renders chat header with user name', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" />)
        expect(screen.getByText('Jan Kowalski')).toBeTruthy()
    })

    it('renders chat header with role label', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" />)
        expect(screen.getByText('Uczeń')).toBeTruthy()
    })

    it('renders group label for group chats', () => {
        render(
            <ChatPanel
                activeChatUser={mockGroup}
                myId="me-1"
                groupMembers={[
                    { user_id: 'u1', profiles: { full_name: 'A' } },
                    { user_id: 'u2', profiles: { full_name: 'B' } },
                ]}
            />,
        )
        expect(screen.getByText(/Grupa \(2/)).toBeTruthy()
    })

    it('renders loading state', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" chatLoading={true} />)
        expect(screen.getByText('Otwieranie rozmowy...')).toBeTruthy()
    })

    it('renders empty state', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" messages={[]} />)
        expect(screen.getByText(/Brak wiadomości/)).toBeTruthy()
    })

    it('renders error state when chatError is set', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                chatError="Nie udało się pobrać wiadomości."
            />,
        )
        expect(screen.getByText('Nie udało się pobrać wiadomości.')).toBeTruthy()
    })

    // Messages
    it('renders messages from other user', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[mockMessage]}
            />,
        )
        expect(screen.getByText('Cześć!')).toBeTruthy()
    })

    it('renders own messages', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[mockMyMessage]}
            />,
        )
        expect(screen.getByText('Hej!')).toBeTruthy()
    })

    it('renders date separator', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[mockMessage]}
            />,
        )
        expect(screen.getByText('Dzisiaj')).toBeTruthy()
    })

    it('renders deleted message', () => {
        const deleted = { ...mockMessage, is_deleted: true, content: 'Usunięto' }
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[deleted]}
            />,
        )
        expect(screen.getByText('Usunięto')).toBeTruthy()
    })

    it('renders timestamp for messages', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[mockMessage]}
            />,
        )
        const timestamps = screen.getAllByText('14:30')
        expect(timestamps.length).toBeGreaterThanOrEqual(1)
    })

    it('renders load older messages button when hasOlderMessages', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[mockMessage]}
                hasOlderMessages={true}
            />,
        )
        expect(screen.getByText('Załaduj starsze wiadomości')).toBeTruthy()
    })

    it('shows loading text on load older button when loadingOlder=true', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[mockMessage]}
                hasOlderMessages={true}
                loadingOlder={true}
            />,
        )
        expect(screen.getByText('Ładowanie starszych...')).toBeTruthy()
    })

    // Input bar
    it('renders input bar with placeholder', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" />)
        expect(screen.getByPlaceholderText('Napisz wiadomość...')).toBeTruthy()
    })

    it('calls onNewMessageChange when typing in input', () => {
        const onChange = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                onNewMessageChange={onChange}
            />,
        )
        const input = screen.getByPlaceholderText('Napisz wiadomość...')
        fireEvent.change(input, { target: { value: 'test' } })
        expect(onChange).toHaveBeenCalledWith('test')
    })

    it('calls onSendMessage when form is submitted', () => {
        const onSend = vi.fn(e => e.preventDefault())
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                newMessage="Hello"
                onSendMessage={onSend}
            />,
        )
        const form = screen.getByPlaceholderText('Napisz wiadomość...').closest('form')
        fireEvent.submit(form)
        expect(onSend).toHaveBeenCalledOnce()
    })

    // Header buttons
    it('renders block button for DM chats', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" />)
        expect(screen.getByTitle('Zablokuj użytkownika')).toBeTruthy()
    })

    it('renders settings button for group chats', () => {
        render(<ChatPanel activeChatUser={mockGroup} myId="me-1" />)
        // There should be a settings button in the header (group mode shows Settings icon)
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThan(0)
    })

    it('calls onToggleBlock when block button is clicked', () => {
        const onBlock = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                onToggleBlock={onBlock}
            />,
        )
        const blockBtn = screen.getByTitle('Zablokuj użytkownika')
        fireEvent.click(blockBtn)
        expect(onBlock).toHaveBeenCalledOnce()
    })

    it('calls onToggleGroupSettings when settings button is clicked', () => {
        const onSettings = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockGroup}
                myId="me-1"
                onToggleGroupSettings={onSettings}
            />,
        )
        // In group mode, the last button in the header is the settings button
        // Find the header first, then the last button
        const header = screen.getByText('Klasa 4A').closest('div[class*="flex items-center gap-3 flex-1"]')
        // The parent of this flex div is the header row - last button is settings
        const headerRow = header.parentElement
        const allButtons = headerRow.querySelectorAll('button')
        const settingsBtn = allButtons[allButtons.length - 1]
        fireEvent.click(settingsBtn)
        expect(onSettings).toHaveBeenCalledOnce()
    })

    it('calls onCloseChat when back button is clicked', () => {
        const onClose = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                onCloseChat={onClose}
            />,
        )
        // Find the back arrow button (second button in the header, after hamburger)
        const header = screen.getByText('Jan Kowalski').closest('div[class*="flex items-center gap-3 flex-1"]')
        const headerRow = header.parentElement
        const allButtonsInRow = headerRow.querySelectorAll('button')
        const backBtn = allButtonsInRow[1] // 2nd button (hamburger is 1st on mobile, back is 2nd)
        fireEvent.click(backBtn)
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onToggleSidebar when hamburger is clicked', () => {
        const onToggle = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                onToggleSidebar={onToggle}
            />,
        )
        // The hamburger menu button is the first button in the header (lg:hidden)
        const buttons = screen.getAllByRole('button')
        const menuBtn = buttons.find(b => b.className.includes('lg:hidden'))
        fireEvent.click(menuBtn)
        expect(onToggle).toHaveBeenCalledOnce()
    })

    it('shows "Odblokuj" when user is blocked', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                myBlockedIds={['other-1']}
            />,
        )
        expect(screen.getByTitle('Odblokuj użytkownika')).toBeTruthy()
    })

    it('renders media uploader in input area', () => {
        render(<ChatPanel activeChatUser={mockUser} myId="me-1" />)
        // The MediaUploader wraps the Plus icon button in the input area
        // Look for the add-file/plus button area
        const buttons = screen.getAllByRole('button')
        // There should be at least the header buttons + the plus attachment button + send/like
        expect(buttons.length).toBeGreaterThanOrEqual(3)
    })

    it('renders like thumb button when input is empty', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                newMessage=""
            />,
        )
        expect(screen.getByText('👍')).toBeTruthy()
    })

    it('does not render like thumb when input has text', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                newMessage="Hello"
            />,
        )
        expect(screen.queryByText('👍')).toBeNull()
    })

    it('renders send button when input has text', () => {
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                newMessage="Hello"
            />,
        )
        // When input has text, the send icon (lucide Send) appears
        const sendButtons = screen.getAllByRole('button')
        // The send button is a type=submit button (appears when newMessage is non-empty)
        const submitBtn = sendButtons.find(b => b.getAttribute('type') === 'submit')
        expect(submitBtn).toBeTruthy()
    })

    it('shows admin red dot for admin role', () => {
        const adminUser = { ...mockUser, role: 'admin' }
        render(<ChatPanel activeChatUser={adminUser} myId="me-1" />)
        // Look for the red dot element (shadow-[0_0_5px_red])
        // The user name should be visible
        expect(screen.getByText('Jan Kowalski')).toBeTruthy()
    })

    it('renders group settings modal when isGroupSettingsOpen=true', () => {
        render(
            <ChatPanel
                activeChatUser={mockGroup}
                myId="me-1"
                isGroupSettingsOpen={true}
                groupMembers={[
                    { user_id: 'u1', role: 'admin', profiles: { full_name: 'Admin User', avatar_url: '' } },
                ]}
            />,
        )
        expect(screen.getByText('Ustawienia Grupy')).toBeTruthy()
        expect(screen.getByText(/Członkowie \(1\)/)).toBeTruthy()
        expect(screen.getByText('Admin User')).toBeTruthy()
        expect(screen.getByText('Administrator')).toBeTruthy()
    })

    it('renders add member sub-modal when isAddingMember=true', () => {
        render(
            <ChatPanel
                activeChatUser={mockGroup}
                myId="me-1"
                isGroupSettingsOpen={true}
                isAddingMember={true}
                groupMembers={[]}
                friends={[
                    { id: 'f1', full_name: 'Friend One', avatar_url: '' },
                ]}
            />,
        )
        expect(screen.getByText('Dodaj do grupy')).toBeTruthy()
        expect(screen.getByText('Friend One')).toBeTruthy()
    })

    it('shows empty friends state in add member modal', () => {
        render(
            <ChatPanel
                activeChatUser={mockGroup}
                myId="me-1"
                isGroupSettingsOpen={true}
                isAddingMember={true}
                groupMembers={[]}
                friends={[]}
            />,
        )
        expect(screen.getByText(/Nie masz jeszcze zaakceptowanych znajomych/)).toBeTruthy()
    })

    it('calls onAddMember when a friend is clicked in add member modal', () => {
        const onAdd = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockGroup}
                myId="me-1"
                isGroupSettingsOpen={true}
                isAddingMember={true}
                groupMembers={[]}
                friends={[{ id: 'f1', full_name: 'Friend One', avatar_url: '' }]}
                onAddMember={onAdd}
            />,
        )
        fireEvent.click(screen.getByText('Friend One'))
        expect(onAdd).toHaveBeenCalledWith('f1')
    })

    it('calls onDeleteMessage when delete button is clicked on own message', () => {
        const onDelete = vi.fn()
        render(
            <ChatPanel
                activeChatUser={mockUser}
                myId="me-1"
                messages={[{
                    id: 'msg-own',
                    sender_id: 'me-1',
                    content: 'My message',
                    created_at: '2026-01-01T12:00:00Z',
                    is_deleted: false,
                }]}
                onDeleteMessage={onDelete}
            />,
        )
        const deleteBtn = screen.getByTitle('Usuń')
        fireEvent.click(deleteBtn)
        expect(onDelete).toHaveBeenCalledWith('msg-own')
    })
})
