import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { NewSession } from './index'

const spawnSessionMock = vi.fn()
const useAgentsMock = vi.fn()
const addRecentPathMock = vi.fn()
const setLastUsedMachineIdMock = vi.fn()
const hapticNotificationMock = vi.fn()
const emptyDirectorySuggestions: string[] = []
const emptyAutocompleteSuggestions: Array<{ key: string; text: string; label: string }> = []
const recentPathsMock = vi.fn(() => [])
const moveSuggestionUpMock = vi.fn()
const moveSuggestionDownMock = vi.fn()
const clearSuggestionsMock = vi.fn()

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: hapticNotificationMock
        }
    })
}))

vi.mock('@/hooks/mutations/useSpawnSession', () => ({
    useSpawnSession: () => ({
        spawnSession: spawnSessionMock,
        isPending: false,
        error: null
    })
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: () => ({
        sessions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn()
    })
}))

vi.mock('@/hooks/queries/useAgents', () => ({
    useAgents: (...args: unknown[]) => useAgentsMock(...args)
}))

vi.mock('@/hooks/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [emptyAutocompleteSuggestions, -1, moveSuggestionUpMock, moveSuggestionDownMock, clearSuggestionsMock]
}))

vi.mock('@/hooks/useDirectorySuggestions', () => ({
    useDirectorySuggestions: () => emptyDirectorySuggestions
}))

const recentPathsApi = {
    getRecentPaths: recentPathsMock,
    addRecentPath: addRecentPathMock,
    getLastUsedMachineId: () => null,
    setLastUsedMachineId: setLastUsedMachineIdMock,
}

vi.mock('@/hooks/useRecentPaths', () => ({
    useRecentPaths: () => recentPathsApi
}))

function createApiStub(): ApiClient {
    return {
        listMachineGitBranches: vi.fn().mockRejectedValue(new Error('not a git repo')),
    } as unknown as ApiClient
}

function createMachines() {
    return [
        {
            id: 'machine-1',
            active: true,
            metadata: {
                host: 'host-a',
                platform: 'linux',
                happyCliVersion: '1.0.0'
            }
        },
        {
            id: 'machine-2',
            active: true,
            metadata: {
                host: 'host-b',
                platform: 'linux',
                happyCliVersion: '1.0.0'
            }
        }
    ]
}

function renderNewSession() {
    return render(
        <I18nProvider>
            <NewSession
                api={createApiStub()}
                machines={createMachines()}
                initialDirectory="/tmp/repo"
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        </I18nProvider>
    )
}

describe('NewSession persona integration', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        recentPathsMock.mockReturnValue([])

        spawnSessionMock.mockResolvedValue({
            type: 'success',
            sessionId: 'session-123'
        })

        useAgentsMock.mockReturnValue({
            agents: [
                { name: 'ops', description: 'Ops workflows', source: 'global' },
                { name: 'bead-architect', description: 'Bead helper', source: 'project' }
            ],
            isLoading: false,
            error: null
        })
    })

    it('sends /agents <persona> as initialPrompt when persona is selected', async () => {
        renderNewSession()

        const createButton = screen.getByRole('button', { name: 'Create' })
        await waitFor(() => {
            expect(createButton).toBeEnabled()
        })

        fireEvent.click(screen.getByRole('button', { name: /ops/i }))
        fireEvent.click(createButton)

        await waitFor(() => {
            expect(spawnSessionMock).toHaveBeenCalledTimes(1)
        })

        expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({
            machineId: 'machine-1',
            directory: '/tmp/repo',
            agent: 'claude',
            initialPrompt: '/agents ops'
        }))
    })

    it('resets persona when provider, directory, or machine changes', async () => {
        renderNewSession()

        await screen.findByRole('button', { name: /None/i })
        const opsButton = screen.getByRole('button', { name: /ops/i })

        fireEvent.click(opsButton)
        expect(opsButton).toHaveAttribute('aria-pressed', 'true')

        fireEvent.click(screen.getByLabelText('codex'))
        fireEvent.click(screen.getByLabelText('claude'))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /None/i })).toHaveAttribute('aria-pressed', 'true')
        })

        fireEvent.click(screen.getByRole('button', { name: /ops/i }))

        fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
            target: { value: '/tmp/other' }
        })

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /None/i })).toHaveAttribute('aria-pressed', 'true')
        })

        fireEvent.click(screen.getByRole('button', { name: /ops/i }))
        const machineSelect = screen.getAllByRole('combobox')[0]
        fireEvent.change(machineSelect, { target: { value: 'machine-2' } })

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /None/i })).toHaveAttribute('aria-pressed', 'true')
        })
    })
})
