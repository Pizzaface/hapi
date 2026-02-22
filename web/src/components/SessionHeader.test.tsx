import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionHeader } from './SessionHeader'
import type { Session } from '@/types/api'

// Mock dependencies
vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        isPending: false,
    })
}))

vi.mock('@/hooks/useTelegram', () => ({
    isTelegramApp: () => false
}))

const mockSession = {
    id: 'test-session-id',
    active: true,
    modelMode: 'auto',
    metadata: {
        path: '/test/path',
        host: 'localhost',
        summary: { text: 'Test Session', updatedAt: Date.now() },
        flavor: 'claude'
    },
} as unknown as Session

describe('SessionHeader', () => {
    it('renders back button with accessible name', () => {
        render(
            <I18nProvider>
                <SessionHeader
                    session={mockSession}
                    onBack={vi.fn()}
                    api={null}
                />
            </I18nProvider>
        )

        const backButton = screen.getByRole('button', { name: 'Back' })
        expect(backButton).toBeInTheDocument()
    })
})
