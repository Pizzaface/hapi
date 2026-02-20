import { describe, expect, it, vi } from 'vitest'
import type { AgentState } from '@/api/types'
import type { PermissionMode } from '../loop'
import type { Session } from '../session'
import { PermissionHandler } from './permissionHandler'

const DEFAULT_MODE = { permissionMode: 'default' as PermissionMode }

type Harness = {
    handler: PermissionHandler
    session: Session
    setSessionMode: (mode: PermissionMode) => void
    getSessionMode: () => PermissionMode
}

function createHarness(initialMode: PermissionMode = 'default'): Harness {
    let currentMode: PermissionMode = initialMode
    let state: AgentState = {
        requests: {},
        completedRequests: {}
    }

    const rpcHandlerManager = {
        registerHandler: vi.fn()
    }

    const session = {
        client: {
            rpcHandlerManager,
            updateAgentState: (updater: (value: AgentState) => AgentState) => {
                state = updater(state)
            }
        },
        queue: {
            unshift: vi.fn(),
            unshiftIsolate: vi.fn()
        },
        setPermissionMode: vi.fn((mode: PermissionMode) => {
            currentMode = mode
        }),
        getPermissionMode: vi.fn(() => currentMode)
    } as unknown as Session

    const handler = new PermissionHandler(session)
    return {
        handler,
        session,
        setSessionMode: (mode: PermissionMode) => {
            currentMode = mode
        },
        getSessionMode: () => currentMode
    }
}

describe('PermissionHandler mid-turn permission mode updates', () => {
    it('auto-approves when session mode switches to bypassPermissions mid-turn', async () => {
        const { handler, setSessionMode } = createHarness('default')

        setSessionMode('bypassPermissions')
        const result = await handler.handleToolCall('Read', { path: 'README.md' }, DEFAULT_MODE, {
            signal: new AbortController().signal
        })

        expect(result.behavior).toBe('allow')
    })

    it('uses live session mode for downgrade from bypassPermissions to default', async () => {
        const { handler, setSessionMode } = createHarness('default')

        handler.handleModeChange('bypassPermissions')
        setSessionMode('default')

        const resolveToolCallIdSpy = vi.spyOn(handler as any, 'resolveToolCallId').mockReturnValue('tool-call-1')
        const abortController = new AbortController()

        const permissionPromise = handler.handleToolCall('Read', { path: 'README.md' }, DEFAULT_MODE, {
            signal: abortController.signal
        })

        await Promise.resolve()
        expect((handler as any).pendingRequests.has('tool-call-1')).toBe(true)

        abortController.abort()
        await expect(permissionPromise).rejects.toThrow('Permission request aborted')

        resolveToolCallIdSpy.mockRestore()
    })

    it('acceptEdits auto-approves edit tools but still prompts for non-edit tools', async () => {
        const { handler, setSessionMode } = createHarness('default')

        setSessionMode('acceptEdits')

        const editResult = await handler.handleToolCall(
            'Edit',
            { file_path: 'README.md', old_string: 'foo', new_string: 'bar' },
            DEFAULT_MODE,
            { signal: new AbortController().signal }
        )
        expect(editResult.behavior).toBe('allow')

        const resolveToolCallIdSpy = vi.spyOn(handler as any, 'resolveToolCallId').mockReturnValue('tool-call-2')
        const abortController = new AbortController()

        const nonEditPromise = handler.handleToolCall('Read', { path: 'README.md' }, DEFAULT_MODE, {
            signal: abortController.signal
        })

        await Promise.resolve()
        expect((handler as any).pendingRequests.has('tool-call-2')).toBe(true)

        abortController.abort()
        await expect(nonEditPromise).rejects.toThrow('Permission request aborted')

        resolveToolCallIdSpy.mockRestore()
    })

    it('handleModeChange keeps handler cache and session mode in sync', () => {
        const { handler, session, getSessionMode } = createHarness('default')

        handler.handleModeChange('acceptEdits')

        expect((handler as any).permissionMode).toBe('acceptEdits')
        expect(getSessionMode()).toBe('acceptEdits')
        expect(session.setPermissionMode).toHaveBeenCalledWith('acceptEdits')
    })
})
