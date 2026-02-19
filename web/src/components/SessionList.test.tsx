import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionList } from './SessionList'

// Mock dependencies
vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        isPending: false
    })
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: { impact: vi.fn(), notification: vi.fn() },
        isTouch: false
    })
}))

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('SessionList', () => {
    afterEach(() => {
        cleanup()
    })

    it('renders loading state when loading and no sessions', () => {
        renderWithProviders(
            <SessionList
                sessions={[]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={true}
                api={null}
            />
        )
        // Check for loading text from en.ts
        expect(screen.getByText('Loading session…')).toBeInTheDocument()
    })

    it('renders empty state when not loading and no sessions', () => {
        const onNewSession = vi.fn()
        renderWithProviders(
            <SessionList
                sessions={[]}
                onSelect={vi.fn()}
                onNewSession={onNewSession}
                onRefresh={vi.fn()}
                isLoading={false}
                api={null}
            />
        )

        expect(screen.getByText('No sessions found')).toBeInTheDocument()
        expect(screen.getByText('Create a new session to get started.')).toBeInTheDocument()

        const createButton = screen.getByRole('button', { name: 'New Session' })
        expect(createButton).toBeInTheDocument()

        fireEvent.click(createButton)
        expect(onNewSession).toHaveBeenCalled()
    })

    it('renders session list when there are sessions', () => {
        const sessions = [{
            id: 'session-1',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            active: true,
            pendingRequestsCount: 0,
            thinking: false,
            modelMode: 'default',
            metadata: {
                name: 'Test Session',
                path: '/test/path'
            }
        }] as any

        renderWithProviders(
            <SessionList
                sessions={sessions}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                api={null}
            />
        )

        expect(screen.getByText('Test Session')).toBeInTheDocument()
        expect(screen.queryByText('No sessions found')).not.toBeInTheDocument()
    })
})
