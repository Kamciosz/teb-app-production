import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MemberList from '../modals/MemberList'

const mockMembers = [
  { user_id: 'u1', role: 'admin', nickname: 'AdminUser', profiles: { full_name: 'Jan Admin', avatar_url: null } },
  { user_id: 'u2', role: 'member', nickname: null, profiles: { full_name: 'Anna Member', avatar_url: null } },
  { user_id: 'u3', role: 'muted', nickname: 'MutedUser', profiles: { full_name: 'Piotr Muted', avatar_url: null } },
]

describe('MemberList', () => {
  it('renders all members with names', () => {
    render(<MemberList members={mockMembers} currentUserId="u1" />)
    expect(screen.getByText('AdminUser')).toBeTruthy()
    expect(screen.getByText('Anna Member')).toBeTruthy()
    expect(screen.getByText('MutedUser')).toBeTruthy()
  })

  it('marks the current user with (Ty)', () => {
    render(<MemberList members={mockMembers} currentUserId="u1" />)
    expect(screen.getByText('AdminUser')).toBeTruthy()
    expect(screen.getByText('(Ty)')).toBeTruthy()
  })

  it('shows role labels correctly', () => {
    render(<MemberList members={mockMembers} currentUserId="u1" />)
    expect(screen.getByText('Administrator')).toBeTruthy()
    expect(screen.getByText('Uczestnik')).toBeTruthy()
    expect(screen.getByText('Wyciszony')).toBeTruthy()
  })

  it('shows empty state when no members', () => {
    render(<MemberList members={[]} currentUserId="u1" />)
    expect(screen.getByText(/Brak członków/)).toBeTruthy()
  })

  it('calls onMemberClick when a member is clicked', () => {
    const onClick = vi.fn()
    render(<MemberList members={mockMembers} currentUserId="u1" onMemberClick={onClick} />)
    screen.getByText('Anna Member').click()
    expect(onClick).toHaveBeenCalledWith(mockMembers[1])
  })

  it('does not call onMemberClick when not provided', () => {
    const onClick = vi.fn()
    render(<MemberList members={mockMembers} currentUserId="u1" />)
    screen.getByText('Anna Member').click()
    expect(onClick).not.toHaveBeenCalled()
  })
})
