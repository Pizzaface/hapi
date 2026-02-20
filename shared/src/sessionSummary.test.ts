import { describe, expect, it } from 'bun:test'
import type { Session } from './schemas'
import { toSessionSummary } from './sessionSummary'

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1_000,
        updatedAt: 2_000,
        active: false,
        activeAt: 2_000,
        metadata: null,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        sortOrder: 'a0',
        thinking: false,
        thinkingAt: 2_000,
        ...overrides
    }
}

describe('toSessionSummary', () => {
    it('includes sortOrder in session summaries', () => {
        const summary = toSessionSummary(makeSession({ sortOrder: 'a0V' }))
        expect(summary.sortOrder).toBe('a0V')
    })

    it('passes through null sortOrder values', () => {
        const summary = toSessionSummary(makeSession({ sortOrder: null }))
        expect(summary.sortOrder).toBeNull()
    })
})
