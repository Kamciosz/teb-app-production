import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DesktopSidebar from '../sidebar/DesktopSidebar'

// Mock external deps
vi.mock('../../../utils/safeContent', () => ({
    sanitizeImageUrl: vi.fn(url => url?.trim() || ''),
    sanitizePlainText: vi.fn((text, opts) => {
        if (!text) return ''
        const max = opts?.maxLength || Infinity
        return text.trim().slice(0, max)
    }),
}))

vi.mock('../../../services/imageKitService', () => ({
    ImageKitService: {
        getOptimizedUrl: vi.fn((url, width) => url),
    },
}))

vi.mock('../../profile/profileMeta', () => ({
    getRoleLabel: vi.fn(role => role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Nauczyciel' : 'Uczeń'),
    getUserInitial: vi.fn(name => (name || '?')[0]?.toUpperCase() || '?'),
}))

// Sample data
const mockPrivateChat = {
    id: 'user-1',
    full_name: 'Jan Kowalski',
    role: 'student',
    avatar_url: '',
    type: 'private',
}

const mockGroupChat = {
    id: 'group-1',
    full_name: 'Klasa 4A',
    role: 'room',
    avatar_url: '',
    type: 'group',
}

describe('DesktopSidebar', () => {
    it('renders the app header (TEBtalk + Komunikator)', () => {
        render(<DesktopSidebar />)
        expect(screen.getByText('TEBtalk')).toBeTruthy()
        expect(screen.getByText('Komunikator')).toBeTruthy()
    })

    it('renders toolbar buttons: Szukaj, Znajomi, Nowa grupa', () => {
        render(<DesktopSidebar />)
        // Toolbar buttons with titles
        expect(screen.getByTitle('Szukaj')).toBeTruthy()
        expect(screen.getByTitle('Znajomi')).toBeTruthy()
        expect(screen.getByTitle('Nowa grupa')).toBeTruthy()
    })

    it('highlights search button when searchActive=true', () => {
        render(<DesktopSidebar searchActive={true} />)
        const searchBtn = screen.getByTitle('Szukaj')
        // Should have primary color class
        expect(searchBtn.className).toContain('text-primary')
    })

    it('highlights friends button when friendsActive=true', () => {
        render(<DesktopSidebar friendsActive={true} />)
        const friendsBtn = screen.getByTitle('Znajomi')
        expect(friendsBtn.className).toContain('text-primary')
    })

    it('shows private chats in Wiadomości section', () => {
        render(<DesktopSidebar recentChats={[mockPrivateChat]} />)
        expect(screen.getByText('Jan Kowalski')).toBeTruthy()
        expect(screen.getByText('Uczeń')).toBeTruthy()
    })

    it('shows group chats in Grupy section', () => {
        render(<DesktopSidebar recentChats={[mockGroupChat]} />)
        expect(screen.getByText('Klasa 4A')).toBeTruthy()
        expect(screen.getByText('Grupa')).toBeTruthy()
    })

    it('shows both sections when both types present', () => {
        const chats = [mockPrivateChat, mockGroupChat]
        render(<DesktopSidebar recentChats={chats} />)
        expect(screen.getByText('Jan Kowalski')).toBeTruthy()
        expect(screen.getByText('Klasa 4A')).toBeTruthy()
        // Section headers
        expect(screen.getByText(/Wiadomości/)).toBeTruthy()
        expect(screen.getByText(/Grupy/)).toBeTruthy()
    })

    it('highlights active chat entry', () => {
        render(
            <DesktopSidebar
                recentChats={[mockPrivateChat]}
                activeChatId="user-1"
            />,
        )
        const entry = screen.getByText('Jan Kowalski').closest('button')
        expect(entry.className).toContain('bg-primary/15')
    })

    it('does not highlight non-active chat', () => {
        render(
            <DesktopSidebar
                recentChats={[mockPrivateChat]}
                activeChatId="other-id"
            />,
        )
        const entry = screen.getByText('Jan Kowalski').closest('button')
        expect(entry.className).not.toContain('bg-primary/15')
    })

    it('calls onSelectChat when a chat entry is clicked', () => {
        const onSelect = vi.fn()
        render(
            <DesktopSidebar
                recentChats={[mockPrivateChat]}
                onSelectChat={onSelect}
            />,
        )
        fireEvent.click(screen.getByText('Jan Kowalski'))
        expect(onSelect).toHaveBeenCalledWith(mockPrivateChat)
    })

    it('calls onToggleSearch when search button clicked', () => {
        const onToggle = vi.fn()
        render(<DesktopSidebar onToggleSearch={onToggle} />)
        fireEvent.click(screen.getByTitle('Szukaj'))
        expect(onToggle).toHaveBeenCalledOnce()
    })

    it('calls onToggleFriends when friends button clicked', () => {
        const onToggle = vi.fn()
        render(<DesktopSidebar onToggleFriends={onToggle} />)
        fireEvent.click(screen.getByTitle('Znajomi'))
        expect(onToggle).toHaveBeenCalledOnce()
    })

    it('calls onToggleCreateGroup when new group button clicked', () => {
        const onToggle = vi.fn()
        render(<DesktopSidebar onToggleCreateGroup={onToggle} />)
        fireEvent.click(screen.getByTitle('Nowa grupa'))
        expect(onToggle).toHaveBeenCalledOnce()
    })

    it('shows empty state when no chats', () => {
        render(<DesktopSidebar recentChats={[]} />)
        expect(screen.getByText(/Brak rozmów/)).toBeTruthy()
    })

    it('renders section counts for private chats', () => {
        const chats = [mockPrivateChat, { ...mockPrivateChat, id: 'user-2' }]
        render(<DesktopSidebar recentChats={chats} />)
        expect(screen.getByText(/Wiadomości \(2\)/)).toBeTruthy()
    })

    it('renders section counts for groups', () => {
        const chats = [mockGroupChat, { ...mockGroupChat, id: 'group-2' }]
        render(<DesktopSidebar recentChats={chats} />)
        expect(screen.getByText(/Grupy \(2\)/)).toBeTruthy()
    })

    it('renders bottom branding (TEBtalk v2)', () => {
        render(<DesktopSidebar />)
        expect(screen.getByText('TEBtalk v2')).toBeTruthy()
    })

    it('renders avatar fallback with initial when no avatar_url', () => {
        const chat = { ...mockPrivateChat, full_name: 'Anna Nowak', avatar_url: '' }
        render(<DesktopSidebar recentChats={[chat]} />)
        // The getByText should find 'A' (the initial) in the avatar
        expect(screen.getByText('A')).toBeTruthy()
    })
})
