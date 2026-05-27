import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import CreateGroup from '../modals/CreateGroup'

// Mock tebtalkQueries
const mockCreateGroup = vi.fn()
vi.mock('../services/tebtalkQueries', () => ({
  createGroup: (...args) => mockCreateGroup(...args),
}))

describe('CreateGroup', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    myId: 'user-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateGroup.mockResolvedValue({ group: { id: 'group-1', name: 'Test' }, error: null })
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<CreateGroup {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the modal with title and input', () => {
    render(<CreateGroup {...defaultProps} />)
    expect(screen.getByText('Nowa Grupa')).toBeTruthy()
    expect(screen.getByPlaceholderText(/np\. Giełda 4A/)).toBeTruthy()
    expect(screen.getByText('Stwórz Pokój')).toBeTruthy()
  })

  it('calls createGroup and onCreated on submission', async () => {
    render(<CreateGroup {...defaultProps} />)
    const input = screen.getByPlaceholderText(/np\. Giełda 4A/)
    fireEvent.change(input, { target: { value: 'Moja Grupa' } })
    fireEvent.click(screen.getByText('Stwórz Pokój'))
    await waitFor(() => {
      expect(mockCreateGroup).toHaveBeenCalledWith('Moja Grupa', 'user-1')
    })
    expect(defaultProps.onCreated).toHaveBeenCalled()
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('disables button when name is empty', () => {
    render(<CreateGroup {...defaultProps} />)
    const button = screen.getByText('Stwórz Pokój')
    expect(button).toBeDisabled()
  })

  it('shows error message on creation failure', async () => {
    mockCreateGroup.mockResolvedValue({ group: null, error: new Error('Błąd!') })
    render(<CreateGroup {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/np\. Giełda 4A/), { target: { value: 'Moja Grupa' } })
    fireEvent.click(screen.getByText('Stwórz Pokój'))
    await waitFor(() => {
      expect(screen.getByText(/Błąd/)).toBeTruthy()
    })
  })

  it('clears input on close via X button', () => {
    render(<CreateGroup {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Zamknij'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
