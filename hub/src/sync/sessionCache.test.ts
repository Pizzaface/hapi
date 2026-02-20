import { describe, expect, it } from 'bun:test'
import type { Session, SyncEvent } from '@hapi/protocol/types'
import { SessionCache } from './sessionCache'
import { Store } from '../store'
import { EventPublisher } from './eventPublisher'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: false,
        activeAt: 0,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        sortOrder: 'a0',
        thinking: false,
        thinkingAt: 0,
        ...overrides
    }
}

function createTestCache() {
    const events: SyncEvent[] = []

    const store = {
        sessions: {
            getSession: (id: string) => makeSession(id),
            getSessions: () => [],
            getOrCreateSession: () => makeSession('test'),
            setSessionTodos: () => false
        },
        messages: {
            getMessages: () => []
        }
    } as unknown as Store

    const sseManager = new SSEManager(0, new VisibilityTracker())
    const publisher = new EventPublisher(sseManager, () => 'default')
    publisher.subscribe((event) => events.push(event))

    const cache = new SessionCache(store, publisher)

    return { cache, events }
}

describe('SessionCache thinking state', () => {
    it('handleSessionAlive broadcasts thinking state changes', () => {
        const { cache, events } = createTestCache()
        const now = Date.now()

        // First alive: session becomes active with thinking=true
        cache.handleSessionAlive({ sid: 's1', time: now, thinking: true })

        const thinkingEvent = events.find(
            e => e.type === 'session-updated' && e.sessionId === 's1' && (e as any).data?.thinking === true
        )
        expect(thinkingEvent).toBeDefined()
    })

    it('handleSessionAlive broadcasts when thinking changes to false', () => {
        const { cache, events } = createTestCache()
        const now = Date.now()

        cache.handleSessionAlive({ sid: 's1', time: now, thinking: true })
        events.length = 0 // clear previous events

        cache.handleSessionAlive({ sid: 's1', time: now + 1000, thinking: false })

        const event = events.find(
            e => e.type === 'session-updated' && e.sessionId === 's1' && (e as any).data?.thinking === false
        )
        expect(event).toBeDefined()
    })

    it('expireInactive broadcasts thinking:false alongside active:false', () => {
        const { cache, events } = createTestCache()
        const now = Date.now()

        // Make session active and thinking
        cache.handleSessionAlive({ sid: 's1', time: now, thinking: true })
        events.length = 0

        // Expire it (31s later)
        cache.expireInactive(now + 31_000)

        // Should have broadcast with BOTH active:false AND thinking:false
        const expireEvent = events.find(
            e => e.type === 'session-updated' && e.sessionId === 's1'
        )
        expect(expireEvent).toBeDefined()
        expect((expireEvent as any).data.active).toBe(false)
        expect((expireEvent as any).data.thinking).toBe(false)
    })

    it('REGRESSION: expireInactive without thinking:false leaves UI showing spinner', () => {
        // This test verifies the fix. Before the fix, expireInactive
        // broadcast { active: false } without thinking: false, so the
        // web UI would keep showing the thinking spinner.
        const { cache, events } = createTestCache()
        const now = Date.now()

        cache.handleSessionAlive({ sid: 's1', time: now, thinking: true })
        events.length = 0

        cache.expireInactive(now + 31_000)

        const expireEvent = events.find(
            e => e.type === 'session-updated' && e.sessionId === 's1'
        )
        // The critical assertion: thinking MUST be explicitly false in the broadcast
        expect((expireEvent as any).data).toHaveProperty('thinking', false)
    })

    it('handleSessionEnd broadcasts thinking:false', () => {
        const { cache, events } = createTestCache()
        const now = Date.now()

        cache.handleSessionAlive({ sid: 's1', time: now, thinking: true })
        events.length = 0

        cache.handleSessionEnd({ sid: 's1', time: now + 1000 })

        const endEvent = events.find(
            e => e.type === 'session-updated' && e.sessionId === 's1'
        )
        expect(endEvent).toBeDefined()
        expect((endEvent as any).data.active).toBe(false)
        expect((endEvent as any).data.thinking).toBe(false)
    })

    it('does not expire sessions within timeout window', () => {
        const { cache, events } = createTestCache()
        const now = Date.now()

        cache.handleSessionAlive({ sid: 's1', time: now, thinking: true })
        events.length = 0

        // Only 10s later — within 30s timeout
        cache.expireInactive(now + 10_000)

        // No expiration events
        const expireEvents = events.filter(
            e => e.type === 'session-updated' && (e as any).data?.active === false
        )
        expect(expireEvents).toHaveLength(0)
    })
})

describe('SessionCache clearInactiveSessions', () => {
    function createPersistentCache() {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const sseManager = new SSEManager(0, new VisibilityTracker())
        const publisher = new EventPublisher(sseManager, () => undefined)
        publisher.subscribe((event) => events.push(event))
        const cache = new SessionCache(store, publisher)
        return { cache, store, events }
    }

    function setSessionUpdatedAt(cache: SessionCache, sessionId: string, updatedAt: number) {
        const session = cache.getSession(sessionId)
        if (!session) {
            throw new Error(`Session missing in cache: ${sessionId}`)
        }
        session.updatedAt = updatedAt
    }

    it('returns only inactive sessions as delete candidates', async () => {
        const { cache, store } = createPersistentCache()
        const now = Date.now()
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

        const inactive = cache.getOrCreateSession('inactive', { path: '/repo', host: 'host' }, null, 'default')
        const active = cache.getOrCreateSession('active', { path: '/repo', host: 'host' }, null, 'default')
        cache.handleSessionAlive({ sid: active.id, time: now })

        setSessionUpdatedAt(cache, inactive.id, now - (thirtyDaysMs + 1_000))
        setSessionUpdatedAt(cache, active.id, now - (thirtyDaysMs + 1_000))

        store.sessionBeads.linkBead(inactive.id, 'hapi-inactive')
        store.sessionBeads.saveSnapshot(inactive.id, 'hapi-inactive', { id: 'hapi-inactive' }, now)

        const result = await cache.clearInactiveSessions('default', thirtyDaysMs)

        expect(result.deleted).toEqual([inactive.id])
        expect(result.failed).toEqual([])
        expect(cache.getSession(inactive.id)).toBeUndefined()
        expect(cache.getSession(active.id)).toBeDefined()
        expect(store.sessions.getSession(inactive.id)).toBeNull()
        expect(store.sessions.getSession(active.id)).not.toBeNull()
        expect(store.sessionBeads.getBeadIds(inactive.id)).toEqual([])
        expect(store.sessionBeads.getSnapshot(inactive.id, 'hapi-inactive')).toBeNull()
    })

    it('respects age filter cutoff', async () => {
        const { cache, store } = createPersistentCache()
        const now = Date.now()
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

        const oldInactive = cache.getOrCreateSession('old', { path: '/repo', host: 'host' }, null, 'default')
        const recentInactive = cache.getOrCreateSession('recent', { path: '/repo', host: 'host' }, null, 'default')

        setSessionUpdatedAt(cache, oldInactive.id, now - (thirtyDaysMs + 1_000))
        setSessionUpdatedAt(cache, recentInactive.id, now - (7 * 24 * 60 * 60 * 1000))

        const result = await cache.clearInactiveSessions('default', thirtyDaysMs)

        expect(result.deleted).toEqual([oldInactive.id])
        expect(result.failed).toEqual([])
        expect(store.sessions.getSession(oldInactive.id)).toBeNull()
        expect(store.sessions.getSession(recentInactive.id)).not.toBeNull()
    })

    it('batch delete is atomic when underlying delete throws', async () => {
        const { cache, store, events } = createPersistentCache()
        const now = Date.now()
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

        const first = cache.getOrCreateSession('first', { path: '/repo', host: 'host' }, null, 'default')
        const second = cache.getOrCreateSession('second', { path: '/repo', host: 'host' }, null, 'default')
        setSessionUpdatedAt(cache, first.id, now - (thirtyDaysMs + 1_000))
        setSessionUpdatedAt(cache, second.id, now - (thirtyDaysMs + 1_000))

        store.sessionBeads.linkBead(first.id, 'hapi-first')
        store.sessionBeads.saveSnapshot(first.id, 'hapi-first', { id: 'hapi-first' }, now)

        ;(store.sessions as unknown as { deleteSessionBatch: () => number }).deleteSessionBatch = () => {
            throw new Error('forced delete failure')
        }

        events.length = 0
        const result = await cache.clearInactiveSessions('default', thirtyDaysMs)

        expect(result.deleted).toEqual([])
        expect(result.failed.sort()).toEqual([first.id, second.id].sort())
        expect(store.sessions.getSession(first.id)).not.toBeNull()
        expect(store.sessions.getSession(second.id)).not.toBeNull()
        expect(store.sessionBeads.getBeadIds(first.id)).toEqual(['hapi-first'])
        expect(store.sessionBeads.getSnapshot(first.id, 'hapi-first')).not.toBeNull()
        expect(events.some((event) => event.type === 'session-removed')).toBe(false)
    })

    it('includes namespace guard when clearing', async () => {
        const { cache, store } = createPersistentCache()
        const now = Date.now()
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

        const alpha = cache.getOrCreateSession('alpha', { path: '/alpha', host: 'host' }, null, 'alpha')
        const beta = cache.getOrCreateSession('beta', { path: '/beta', host: 'host' }, null, 'beta')

        setSessionUpdatedAt(cache, alpha.id, now - (thirtyDaysMs + 1_000))
        setSessionUpdatedAt(cache, beta.id, now - (thirtyDaysMs + 1_000))

        const result = await cache.clearInactiveSessions('alpha', thirtyDaysMs)

        expect(result.deleted).toEqual([alpha.id])
        expect(result.failed).toEqual([])
        expect(store.sessions.getSession(alpha.id)).toBeNull()
        expect(store.sessions.getSession(beta.id)).not.toBeNull()
    })

    it('emits session-removed with explicit namespace', async () => {
        const { cache, events } = createPersistentCache()
        const now = Date.now()

        const alpha = cache.getOrCreateSession('alpha', { path: '/alpha', host: 'host' }, null, 'alpha')
        const beta = cache.getOrCreateSession('beta', { path: '/beta', host: 'host' }, null, 'beta')
        setSessionUpdatedAt(cache, alpha.id, now - 1_000)
        setSessionUpdatedAt(cache, beta.id, now - 1_000)

        events.length = 0
        const result = await cache.clearInactiveSessions('alpha')

        expect(result.deleted).toEqual([alpha.id])

        const removedEvents = events.filter((event) => event.type === 'session-removed')
        expect(removedEvents).toEqual([
            { type: 'session-removed', sessionId: alpha.id, namespace: 'alpha' }
        ])
    })
})


describe('SessionCache bead link merge behavior', () => {
    it('reassigns bead links when sessions merge', async () => {
        const store = new Store(':memory:')
        const sseManager = new SSEManager(0, new VisibilityTracker())
        const publisher = new EventPublisher(sseManager, () => 'default')
        const cache = new SessionCache(store, publisher)

        const oldSession = store.sessions.getOrCreateSession('old-tag', { path: '/repo', host: 'host' }, null, 'default')
        const newSession = store.sessions.getOrCreateSession('new-tag', { path: '/repo', host: 'host' }, null, 'default')
        expect(oldSession.sortOrder).not.toBe(newSession.sortOrder)
        store.sessionBeads.linkBead(oldSession.id, 'hapi-6uf')

        await cache.mergeSessions(oldSession.id, newSession.id, 'default')

        expect(store.sessionBeads.getBeadIds(oldSession.id)).toEqual([])
        expect(store.sessionBeads.getBeadIds(newSession.id)).toContain('hapi-6uf')
        expect(store.sessions.getSession(newSession.id)?.sortOrder).toBe(oldSession.sortOrder)
    })
})

describe('SessionCache sort order updates', () => {
    it('updates sort order without bumping updatedAt', async () => {
        const store = new Store(':memory:')
        const sseManager = new SSEManager(0, new VisibilityTracker())
        const publisher = new EventPublisher(sseManager, () => 'default')
        const cache = new SessionCache(store, publisher)

        const session = store.sessions.getOrCreateSession('sort-order', { path: '/repo', host: 'host' }, null, 'default')
        cache.refreshSession(session.id)
        const before = store.sessions.getSession(session.id)
        if (!before?.sortOrder) {
            throw new Error('Session sort order missing before update')
        }

        await cache.updateSessionSortOrder(session.id, `${before.sortOrder}V`)

        const after = store.sessions.getSession(session.id)
        expect(after?.sortOrder).toBe(`${before.sortOrder}V`)
        expect(after?.updatedAt).toBe(before.updatedAt)
    })
})
