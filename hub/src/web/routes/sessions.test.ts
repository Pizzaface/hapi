import { describe, it, expect } from 'bun:test'
import { createSessionsRoutes } from './sessions'
import type { SyncEngine } from '../../sync/syncEngine'
import type { Session } from '@hapi/protocol/types'

describe('Sessions Routes Security', () => {
    // Basic mock session that passes validation
    const mockSession = {
        id: 'sess-123',
        active: true,
        updatedAt: Date.now(),
        metadata: {
            flavor: 'claude',
            path: '/tmp/test',
            host: 'localhost'
        },
        agentState: null,
        namespace: 'default'
    } as unknown as Session

    it('should sanitize error message in /sessions/:id/permission-mode', async () => {
        // Mock SyncEngine to throw a sensitive error
        const mockEngine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 'sess-123', session: mockSession }),
            applySessionConfig: async () => {
                throw new Error('DATABASE_CONNECTION_FAILED: user=root password=secret host=10.0.0.5')
            }
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => mockEngine)

        const res = await app.request('/sessions/sess-123/permission-mode', {
            method: 'POST',
            body: JSON.stringify({ mode: 'default' }),
            headers: { 'Content-Type': 'application/json' }
        })

        expect(res.status).toBe(500)
        const body = await res.json() as { error: string }

        // Verify that the sensitive error message is NOT returned
        expect(body.error).toBe('Failed to apply permission mode')
    })

    it('should return sanitized error for concurrent modification in PATCH /sessions/:id', async () => {
        const mockEngine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 'sess-123', session: mockSession }),
            renameSession: async () => {
                // Simulating an error that contains "concurrently"
                throw new Error('Optimistic lock failure: Session was modified concurrently by another process')
            }
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => mockEngine)

        const res = await app.request('/sessions/sess-123', {
            method: 'PATCH',
            body: JSON.stringify({ name: 'new name' }),
            headers: { 'Content-Type': 'application/json' }
        })

        expect(res.status).toBe(409)
        const body = await res.json() as { error: string }
        expect(body.error).toBe('Session was modified concurrently')
    })

    it('should return sanitized error for active session race condition in DELETE /sessions/:id', async () => {
        // Mock session as inactive initially so it passes the first check
        const inactiveSession = { ...mockSession, active: false }

        const mockEngine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 'sess-123', session: inactiveSession }),
            deleteSession: async () => {
                // Simulating race condition where session became active
                throw new Error('Cannot delete active session')
            }
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => mockEngine)

        const res = await app.request('/sessions/sess-123', {
            method: 'DELETE'
        })

        expect(res.status).toBe(409)
        const body = await res.json() as { error: string }
        expect(body.error).toBe('Cannot delete active session')
    })

    it('should sanitize error message in /sessions/:id/abort', async () => {
        const mockEngine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 'sess-123', session: mockSession }),
            abortSession: async () => {
                throw new Error('RPC_FAILED: connection refused')
            }
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => mockEngine)

        const res = await app.request('/sessions/sess-123/abort', {
            method: 'POST'
        })

        expect(res.status).toBe(500)
        const body = await res.json() as { error: string }
        expect(body.error).toBe('Failed to abort session')
    })

    it('should sanitize 500 errors in /sessions/:id/resume', async () => {
        const mockEngine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 'sess-123', session: mockSession }),
            resumeSession: async () => ({
                type: 'error',
                code: 'resume_failed',
                message: 'INTERNAL_ERROR: Connection refused'
            })
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => mockEngine)

        const res = await app.request('/sessions/sess-123/resume', {
            method: 'POST'
        })

        expect(res.status).toBe(500)
        const body = await res.json() as { error: string }
        expect(body.error).toBe('Failed to resume session')
    })

    it('should preserve 404 errors in /sessions/:id/resume', async () => {
        const mockEngine = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 'sess-123', session: mockSession }),
            resumeSession: async () => ({
                type: 'error',
                code: 'session_not_found',
                message: 'Session not found'
            })
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => mockEngine)

        const res = await app.request('/sessions/sess-123/resume', {
            method: 'POST'
        })

        expect(res.status).toBe(404)
        const body = await res.json() as { error: string }
        expect(body.error).toBe('Session not found')
    })
})
