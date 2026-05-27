import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import RoleManager from '../modals/RoleManager'

// Mock tebtalkQueries
const mockUpdateMemberRole = vi.fn()
const mockRemoveMember = vi.fn()
vi.mock('../services/tebtalkQueries', () => ({
  updateMemberRole: (...args) => mockUpdateMemberRole(...args),
  removeMember: (...args) => mockRemoveMember(...args),
}))

const baseMember = {
  user_id: 'u2',
  role: 'member',
  nickname: null,
  profiles: { full_name: 'Test User', avatar_url: null },
}

const defaultProps = {
  member: baseMember,
  currentUserId: 'u1',
  currentUserRole: 'admin',
  groupId: 'group-1',
  onRoleChanged: vi.fn(),
  onMemberRemoved: vi.fn(),
  onClose: vi.fn(),
}

describe('RoleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateMemberRole.mockResolvedValue({ error: null })
    mockRemoveMember.mockResolvedValue({ error: null })
    // Mock confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('returns null when member is null', () => {
    const { container } = render(<RoleManager {...defaultProps} member={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders member name and current role', () => {
    render(<RoleManager {...defaultProps} />)
    expect(screen.getByText('Test User')).toBeTruthy()
    expect(screen.getByText(/Obecna rola: member/)).toBeTruthy()
  })

  it('shows role options for admin', () => {
    render(<RoleManager {...defaultProps} />)
    expect(screen.getByText('Administrator')).toBeTruthy()
    expect(screen.getByText('Moderator')).toBeTruthy()
    expect(screen.getByText('Uczestnik (obecna)')).toBeTruthy()
    expect(screen.getByText('Wyciszony')).toBeTruthy()
  })

  it('calls updateMemberRole when a new role is clicked', async () => {
    render(<RoleManager {...defaultProps} />)
    fireEvent.click(screen.getByText(/^Moderator$/))
    await waitFor(() => {
      expect(mockUpdateMemberRole).toHaveBeenCalledWith('group-1', 'u2', 'moderator')
    })
    expect(defaultProps.onRoleChanged).toHaveBeenCalled()
  })

  it('shows "cannot manage yourself" for current user', () => {
    render(<RoleManager {...defaultProps} member={{ ...baseMember, user_id: 'u1' }} />)
    expect(screen.getByText(/Nie możesz zmienić własnej roli/)).toBeTruthy()
  })

  it('shows "no permission" for member without manage rights', () => {
    render(<RoleManager {...defaultProps} currentUserRole="member" />)
    expect(screen.getByText(/Nie masz uprawnień/)).toBeTruthy()
  })

  it('shows remove button for admin/owner', () => {
    render(<RoleManager {...defaultProps} />)
    expect(screen.getByText('Usuń z grupy')).toBeTruthy()
  })

  it('removes member on remove click', async () => {
    render(<RoleManager {...defaultProps} />)
    fireEvent.click(screen.getByText('Usuń z grupy'))
    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalledWith('group-1', 'u2')
    })
    expect(defaultProps.onMemberRemoved).toHaveBeenCalled()
  })

  it('closes on X button', () => {
    render(<RoleManager {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Zamknij'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
