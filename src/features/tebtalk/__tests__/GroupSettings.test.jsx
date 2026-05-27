import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import GroupSettings from '../modals/GroupSettings'

// Mock tebtalkQueries
const mockAddMember = vi.fn()
const mockUpdateGroup = vi.fn()
const mockLeaveGroup = vi.fn()
vi.mock('../services/tebtalkQueries', () => ({
  addMember: (...args) => mockAddMember(...args),
  updateGroup: (...args) => mockUpdateGroup(...args),
  leaveGroup: (...args) => mockLeaveGroup(...args),
}))

const mockMembers = [
  { user_id: 'u1', role: 'admin', nickname: null, profiles: { full_name: 'Jan Admin', avatar_url: null } },
  { user_id: 'u2', role: 'member', nickname: null, profiles: { full_name: 'Anna Member', avatar_url: null } },
]

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  groupMembers: mockMembers,
  friends: [{ id: 'u3', full_name: 'Friend User', avatar_url: null }],
  currentUserId: 'u1',
  currentUserRole: 'admin',
  groupId: 'group-1',
  groupName: 'Test Group',
  groupImageUrl: '',
  onGroupUpdated: vi.fn(),
  onMemberAdded: vi.fn(),
  onRoleChanged: vi.fn(),
  onMemberRemoved: vi.fn(),
  onLeaveGroup: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}

describe('GroupSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddMember.mockResolvedValue({ error: null })
    mockUpdateGroup.mockResolvedValue({ error: null })
    mockLeaveGroup.mockResolvedValue({ error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<GroupSettings {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders modal with group name', () => {
    render(<GroupSettings {...defaultProps} />)
    expect(screen.getByText('Ustawienia Grupy')).toBeTruthy()
  })

  it('shows member list tab by default', () => {
    render(<GroupSettings {...defaultProps} />)
    expect(screen.getByText('Jan Admin')).toBeTruthy()
    expect(screen.getByText('Anna Member')).toBeTruthy()
  })

  it('shows settings tab for admins', () => {
    render(<GroupSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Ustawienia'))
    expect(screen.getByText('Test Group')).toBeTruthy()
  })

  it('shows Add Member sub-modal', () => {
    render(<GroupSettings {...defaultProps} />)
    fireEvent.click(screen.getByText(/Dodaj znajomego/))
    expect(screen.getByText('Friend User')).toBeTruthy()
  })

  it('handles add member', async () => {
    render(<GroupSettings {...defaultProps} />)
    fireEvent.click(screen.getByText(/Dodaj znajomego/))
    fireEvent.click(screen.getByText('Friend User'))
    await waitFor(() => {
      expect(mockAddMember).toHaveBeenCalledWith('group-1', 'u3')
    })
    expect(defaultProps.onMemberAdded).toHaveBeenCalled()
    expect(defaultProps.toast.success).toHaveBeenCalled()
  })

  it('handles leave group', async () => {
    render(<GroupSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Opuść grupę'))
    await waitFor(() => {
      expect(mockLeaveGroup).toHaveBeenCalledWith('group-1', 'u1')
    })
    expect(defaultProps.onLeaveGroup).toHaveBeenCalled()
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('shows no settings tab for non-admin members', () => {
    const { container } = render(<GroupSettings {...defaultProps} currentUserRole="member" />)
    expect(container.querySelector('[class*="Ustawienia"]')).toBeNull
  })
})
