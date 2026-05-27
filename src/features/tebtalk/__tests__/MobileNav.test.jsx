import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MobileNav from '../layout/MobileNav'

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
    getRoleLabel: vi.fn(role => role === 'admin' ? 'Administrator' : 'Uczeń'),
    getUserInitial: vi.fn(name => (name || '?')[0]?.toUpperCase() || '?'),
}))

const mockChat = {
    id: 'user-1',
    full_name: 'Jan Kowalski',
    role: 'student',
    avatar_url: '',
    type: 'private',
}

const mockFriend = {
    id: 'friend-1',
    full_name: 'Anna Nowak',
    role: 'student',
    avatar_url: '',
}

describe('MobileNav', () => {
    it('returns null when isOpen=false', () => {
        const { container } = render(<MobileNav isOpen={false} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders level 1 sidebar when isOpen=true (default level=1)', () => {
        render(<MobileNav isOpen={true} />)
        expect(screen.getByText('Rozmowy')).toBeTruthy()
    })

    it('shows chat list in level 1', () => {
        render(<MobileNav isOpen={true} recentChats={[mockChat]} />)
        expect(screen.getByText('Jan Kowalski')).toBeTruthy()
    })

    it('shows empty state in level 1 when no chats', () => {
        render(<MobileNav isOpen={true} />)
        expect(screen.getByText('Brak rozmów')).toBeTruthy()
    })

    it('calls onSelectChat when a chat is clicked in level 1', () => {
        const onSelect = vi.fn()
        render(
            <MobileNav
                isOpen={true}
                recentChats={[mockChat]}
                onSelectChat={onSelect}
            />,
        )
        fireEvent.click(screen.getByText('Jan Kowalski'))
        expect(onSelect).toHaveBeenCalledWith(mockChat)
    })

    it('calls onClose when backdrop is clicked', () => {
        const onClose = vi.fn()
        const { container } = render(<MobileNav isOpen={true} onClose={onClose} />)
        // Click the backdrop (first child of the fixed container)
        const backdrop = container.querySelector('.fixed.inset-0')
        const bgDiv = backdrop.querySelector('.bg-black\\/60')
        if (bgDiv) fireEvent.click(bgDiv)
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onLevelChange(2) when Szukaj shortcut is clicked in level 1', () => {
        const onChange = vi.fn()
        render(<MobileNav isOpen={true} onLevelChange={onChange} />)
        const buttons = screen.getAllByText('Szukaj')
        // Use the bottom shortcut button, not the header title
        const shortcut = buttons[buttons.length - 1]
        fireEvent.click(shortcut.closest('button'))
        expect(onChange).toHaveBeenCalledWith(2)
    })

    it('calls onLevelChange(3) when Grupa shortcut is clicked in level 1', () => {
        const onChange = vi.fn()
        render(<MobileNav isOpen={true} onLevelChange={onChange} />)
        const buttons = screen.getAllByText('Grupa')
        const shortcut = buttons[buttons.length - 1]
        fireEvent.click(shortcut.closest('button'))
        expect(onChange).toHaveBeenCalledWith(3)
    })

    it('renders level 2 with friends view when showFriends=true', () => {
        render(
            <MobileNav
                isOpen={true}
                currentLevel={2}
                showFriends={true}
                friends={[mockFriend]}
            />,
        )
        expect(screen.getByText('Znajomi')).toBeTruthy()
        expect(screen.getByText('Anna Nowak')).toBeTruthy()
    })

    it('renders level 2 with search view when showFriends=false', () => {
        render(<MobileNav isOpen={true} currentLevel={2} showFriends={false} />)
        // Level 2 header shows 'Szukaj' title when showFriends=false
        expect(screen.getByText('Szukaj')).toBeTruthy()
        // Input field with search placeholder
        const searchInput = screen.getByPlaceholderText('Wyszukaj osobę...')
        expect(searchInput).toBeTruthy()
    })

    it('shows empty friends state', () => {
        render(
            <MobileNav
                isOpen={true}
                currentLevel={2}
                showFriends={true}
                friends={[]}
            />,
        )
        expect(screen.getByText(/Nie masz jeszcze znajomych/)).toBeTruthy()
    })

    it('calls onLevelChange(1) when back arrow clicked in level 2', () => {
        const onChange = vi.fn()
        render(<MobileNav isOpen={true} currentLevel={2} onLevelChange={onChange} />)
        // Find the back button in the level 2 header — it's the first button with an svg
        const header = screen.getByText('Szukaj').closest('div[class*="flex items-center gap-3"]')
        const backBtn = header.querySelector('button')
        fireEvent.click(backBtn)
        expect(onChange).toHaveBeenCalledWith(1)
    })

    it('calls onToggleBlock when block button is clicked in search results', () => {
        const onBlock = vi.fn()
        const searchUser = { id: 's1', full_name: 'Test User', role: 'student', avatar_url: '' }
        render(
            <MobileNav
                isOpen={true}
                currentLevel={2}
                showFriends={false}
                searchResults={[searchUser]}
                searchQuery="Test"
                onToggleBlock={onBlock}
            />,
        )
        // Find the block button (UserX icon)
        const blockBtns = screen.getAllByTitle('Zablokuj')
        expect(blockBtns.length).toBeGreaterThan(0)
        fireEvent.click(blockBtns[0])
        expect(onBlock).toHaveBeenCalledWith('s1')
    })

    it('calls onOpenChat when a search result is clicked', () => {
        const onOpenChat = vi.fn()
        const searchUser = { id: 's1', full_name: 'Test User', role: 'student', avatar_url: '' }
        render(
            <MobileNav
                isOpen={true}
                currentLevel={2}
                showFriends={false}
                searchResults={[searchUser]}
                searchQuery="Test"
                onOpenChat={onOpenChat}
            />,
        )
        fireEvent.click(screen.getByText('Test User'))
        expect(onOpenChat).toHaveBeenCalledWith({ ...searchUser, type: 'private' })
    })

    it('highlights active chat in level 1 sidebar', () => {
        render(
            <MobileNav
                isOpen={true}
                recentChats={[mockChat]}
                activeChatId="user-1"
            />,
        )
        const entry = screen.getByText('Jan Kowalski').closest('button')
        expect(entry.className).toContain('bg-primary/15')
    })

    it('calls onClose when close button (X) clicked in level 1', () => {
        const onClose = vi.fn()
        render(<MobileNav isOpen={true} onClose={onClose} />)
        // Find the close button in the level 1 header — it's the button with an X svg icon, next to 'Rozmowy'
        const header = screen.getByText('Rozmowy').closest('div[class*="flex items-center justify-between"]')
        const closeBtn = header.querySelector('button')
        fireEvent.click(closeBtn)
        expect(onClose).toHaveBeenCalledOnce()
    })
})
