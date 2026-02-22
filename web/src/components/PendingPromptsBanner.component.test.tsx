import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionSummary } from '@/types/api'

const navigateMock = vi.fn()
const useSessionsMock = vi.fn()
const tMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigateMock
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: (api: unknown) => useSessionsMock(api)
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: tMock
    })
}))

import { PendingPromptsBanner } from './PendingPromptsBanner'

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    const { id, ...rest } = overrides
    return {
        id,
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        sortOrder: null,
        metadata: { path: '/repo' },
        todoProgress: null,
        pendingRequestsCount: 0,
        ...rest
    }
}

function mockSessions(sessions: SessionSummary[]) {
    useSessionsMock.mockReturnValue({
        sessions,
        isLoading: false,
        error: null,
        refetch: vi.fn()
    })
}

describe('PendingPromptsBanner component', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        tMock.mockImplementation((key: string, params?: Record<string, unknown>) => {
            if (key === 'pendingPrompts.message') {
                return `pending:${params?.n}:${params?.m}:${params?.name}`
            }
            if (key === 'pendingPrompts.open') {
                return 'Open'
            }
            return key
        })
    })

    afterEach(() => {
        cleanup()
    })

    it('renders as a clickable chip when pending prompts exist', () => {
        mockSessions([
            makeSession({
                id: 'session-1',
                pendingRequestsCount: 2,
                updatedAt: 100,
                metadata: { path: '/repo', name: 'Session One' }
            }),
            makeSession({
                id: 'session-2',
                pendingRequestsCount: 1,
                updatedAt: 50,
                metadata: { path: '/repo', name: 'Session Two' }
            })
        ])

        render(<PendingPromptsBanner api={null} />)

        const message = screen.getByText('pending:3:2:Session One')
        expect(message).toBeInTheDocument()
        expect(message).toHaveClass('truncate')

        const chip = screen.getByRole('button')
        expect(chip.className).toContain('rounded-xl')
    })

    it('shows the total pending count in a badge', () => {
        mockSessions([
            makeSession({
                id: 'session-1',
                pendingRequestsCount: 5,
                metadata: { path: '/repo', name: 'Session One' }
            })
        ])

        render(<PendingPromptsBanner api={null} />)

        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('does not render when no pending prompts exist', () => {
        mockSessions([
            makeSession({ id: 'session-1', pendingRequestsCount: 0 }),
            makeSession({ id: 'session-2', pendingRequestsCount: 0 })
        ])

        const { container } = render(<PendingPromptsBanner api={null} />)

        expect(container.firstChild).toBeNull()
    })

    it('navigates to the primary pending session when clicked', () => {
        mockSessions([
            makeSession({
                id: 'target-session',
                pendingRequestsCount: 1,
                metadata: { path: '/repo', name: 'Target Session' }
            })
        ])

        render(<PendingPromptsBanner api={null} />)

        fireEvent.click(screen.getByRole('button'))

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/sessions/$sessionId',
            params: { sessionId: 'target-session' }
        })
    })

    it('positions as a fixed top toast below the header with z-40', () => {
        mockSessions([
            makeSession({
                id: 'session-1',
                pendingRequestsCount: 1,
                metadata: { path: '/repo', name: 'Session One' }
            })
        ])

        const { container } = render(<PendingPromptsBanner api={null} />)
        const wrapper = container.firstElementChild

        expect(wrapper).toHaveClass('fixed', 'z-40')
        expect(wrapper).toHaveClass('pointer-events-none')
        expect(wrapper?.className).toContain('top-[')
    })
})
