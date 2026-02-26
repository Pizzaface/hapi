import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SessionHeader } from '@/components/SessionHeader'
import { SessionList } from '@/components/SessionList'
import type { Session, SessionSummary } from '@/types/api'

// Mock useTranslation
vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'session.header.back': 'Back',
                'session.header.devView': 'Developer View',
                'session.header.files': 'Session Files',
                'session.header.more': 'More Actions',
                'sessions.new': 'New Session',
                'session.title': 'Files', // Old key for fallback if needed
                'session.more': 'More actions' // Old key for fallback if needed
            }
            return translations[key] || key
        }
    })
}))

// Mock useSessionActions
vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        isPending: false
    })
}))

// Mock usePlatform
vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: { impact: vi.fn(), notification: vi.fn() },
        isTouch: false
    })
}))

describe('Accessibility Checks', () => {
    it('SessionHeader should have aria-labels on buttons', () => {
        const mockSession = {
            id: 'session-1',
            active: true,
            metadata: { flavor: 'claude' }
        } as Session

        render(
            <SessionHeader
                session={mockSession}
                onBack={vi.fn()}
                onViewFiles={vi.fn()}
                onToggleDevView={vi.fn()}
                devViewActive={false}
                api={null}
            />
        )

        expect(screen.getByLabelText('Back')).toBeInTheDocument()
        expect(screen.getByLabelText('Developer View')).toBeInTheDocument()
        expect(screen.getByLabelText('Session Files')).toBeInTheDocument()
        expect(screen.getByLabelText('More Actions')).toBeInTheDocument()
    })

    it('SessionList should have aria-label on New Session button', () => {
        const mockSessions: SessionSummary[] = []

        render(
            <SessionList
                sessions={mockSessions}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                api={null}
            />
        )

        expect(screen.getByLabelText('New Session')).toBeInTheDocument()
    })
})
