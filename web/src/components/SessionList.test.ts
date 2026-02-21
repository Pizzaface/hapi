import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionSummary, SessionsResponse, TeamSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import {
    applyOptimisticSortOrderUpdates,
    applySortOrderUpdatesToSessions,
    buildSortOrderUpdatesForReorder,
    getClearInactiveCounts,
    getSessionSortOrder,
    getUnreadLabelClass,
    groupSessions,
    loadSessionReadHistory,
    pruneSessionReadHistory,
    saveSessionReadHistory,
    sortSessionsBySortOrder,
} from './SessionList'

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    const { id, ...rest } = overrides
    const base: SessionSummary = {
        id,
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        sortOrder: null,
        metadata: {
            path: '/repo'
        },
        todoProgress: null,
        pendingRequestsCount: 0
    }

    return {
        ...base,
        ...rest,
        id,
    }
}

function makeTeam(overrides: Partial<TeamSummary> & { id: string; name: string }): TeamSummary {
    return {
        color: null,
        persistent: true,
        sortOrder: null,
        memberSessionIds: [],
        ...overrides,
    }
}

describe('sortSessionsBySortOrder', () => {
    it('sorts by sortOrder asc, null last, id tie-breaker', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 'c', sortOrder: 'b' }),
            makeSession({ id: 'a', sortOrder: 'a' }),
            makeSession({ id: 'b', sortOrder: 'a' }),
            makeSession({ id: 'z', sortOrder: null }),
            makeSession({ id: 'y', sortOrder: null }),
        ]

        const sorted = sortSessionsBySortOrder(sessions)

        expect(sorted.map(session => session.id)).toEqual(['a', 'b', 'c', 'y', 'z'])
    })

    it('does not mutate input array', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 'a', sortOrder: 'b' }),
            makeSession({ id: 'b', sortOrder: 'a' }),
        ]

        sortSessionsBySortOrder(sessions)

        expect(sessions.map(session => session.id)).toEqual(['a', 'b'])
    })

    it('uses lexicographic comparison for base62 keys (not locale-aware compare)', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 'lower', sortOrder: 'a' }),
            makeSession({ id: 'upper', sortOrder: 'Z' }),
        ]

        const sorted = sortSessionsBySortOrder(sessions)

        expect(sorted.map(session => session.id)).toEqual(['upper', 'lower'])
    })
})

describe('groupSessions', () => {
    it('groups by directory when no teams', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 'a2', sortOrder: 'c', metadata: { path: '/repo-a' } }),
            makeSession({ id: 'a1', sortOrder: 'b', metadata: { path: '/repo-a' } }),
            makeSession({ id: 'b1', sortOrder: 'a', metadata: { path: '/repo-b' } }),
        ]

        const groups = groupSessions(sessions, [], {})

        expect(groups.map(group => group.type)).toEqual(['directory', 'directory'])
        const dirGroups = groups.filter(g => g.type === 'directory')
        expect(dirGroups.map(g => g.directory)).toEqual(['/repo-a', '/repo-b'])
        expect(dirGroups[0]?.sessions.map(session => session.id)).toEqual(['a1', 'a2'])
    })

    it('buckets team members into team groups', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 's1', sortOrder: 'a', metadata: { path: '/repo-a' } }),
            makeSession({ id: 's2', sortOrder: 'b', metadata: { path: '/repo-a' } }),
            makeSession({ id: 's3', sortOrder: 'c', metadata: { path: '/repo-b' } }),
        ]
        const teams: TeamSummary[] = [
            makeTeam({ id: 't1', name: 'Team Alpha', memberSessionIds: ['s1', 's2'] }),
        ]

        const groups = groupSessions(sessions, teams, {})

        expect(groups).toHaveLength(2)
        expect(groups[0]?.type).toBe('team')
        if (groups[0]?.type === 'team') {
            expect(groups[0].teamName).toBe('Team Alpha')
            expect(groups[0].sessions.map(s => s.id)).toEqual(['s1', 's2'])
        }
        expect(groups[1]?.type).toBe('directory')
        if (groups[1]?.type === 'directory') {
            expect(groups[1].sessions.map(s => s.id)).toEqual(['s3'])
        }
    })

    it('sorts team groups before directory groups', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 's1', metadata: { path: '/aaa' } }),
            makeSession({ id: 's2', metadata: { path: '/bbb' } }),
        ]
        const teams: TeamSummary[] = [
            makeTeam({ id: 't1', name: 'Zeta Team', memberSessionIds: ['s2'] }),
        ]

        const groups = groupSessions(sessions, teams, {})

        expect(groups[0]?.type).toBe('team')
        expect(groups[1]?.type).toBe('directory')
    })

    it('orders directory groups alphabetically regardless of session sortOrder', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 'lower', sortOrder: 'a', metadata: { path: '/repo-lower' } }),
            makeSession({ id: 'upper', sortOrder: 'Z', metadata: { path: '/repo-upper' } }),
        ]

        const groups = groupSessions(sessions, [], {})
        const dirGroups = groups.filter(g => g.type === 'directory')

        expect(dirGroups.map(g => g.directory)).toEqual(['/repo-lower', '/repo-upper'])
    })

    it('sorts Other group last', () => {
        const sessions: SessionSummary[] = [
            makeSession({ id: 'z1', sortOrder: 'a', metadata: { path: '/zoo' } }),
            makeSession({ id: 'o1', sortOrder: 'b', metadata: null }),
            makeSession({ id: 'a1', sortOrder: 'c', metadata: { path: '/alpha' } }),
        ]

        const groups = groupSessions(sessions, [], {})
        const dirGroups = groups.filter(g => g.type === 'directory')

        expect(dirGroups.map(g => g.directory)).toEqual(['/alpha', '/zoo', 'Other'])
    })
})

describe('reorder helpers', () => {
    it('computes moved-session sortOrder between neighbors', () => {
        const a = makeSession({ id: 'a', sortOrder: 'a' })
        const b = makeSession({ id: 'b', sortOrder: 'b' })
        const c = makeSession({ id: 'c', sortOrder: 'c' })

        const updates = buildSortOrderUpdatesForReorder([a, c, b], 'c')

        expect(updates).toHaveLength(1)
        expect(updates[0]?.sessionId).toBe('c')

        const nextSortOrder = updates[0]?.sortOrder
        expect(nextSortOrder).not.toBeNull()
        expect(nextSortOrder! > getSessionSortOrder(a)!).toBe(true)
        expect(nextSortOrder! < getSessionSortOrder(b)!).toBe(true)
    })

    it('applies and rolls back optimistic updates', () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false }
            }
        })

        const initial: SessionsResponse = {
            sessions: [
                makeSession({ id: 'a', sortOrder: 'a' }),
                makeSession({ id: 'b', sortOrder: 'b' }),
            ]
        }

        queryClient.setQueryData(queryKeys.sessions, initial)

        const rollback = applyOptimisticSortOrderUpdates(queryClient, [
            { sessionId: 'b', sortOrder: 'aa' }
        ])

        const optimistic = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(optimistic?.sessions.find(session => session.id === 'b')?.sortOrder).toBe('aa')

        rollback()

        const restored = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(restored).toEqual(initial)
    })

    it('applySortOrderUpdatesToSessions returns same reference on no updates', () => {
        const sessions = [
            makeSession({ id: 'a', sortOrder: 'a' })
        ]

        expect(applySortOrderUpdatesToSessions(sessions, [])).toBe(sessions)
    })
})

describe('SessionList helpers', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('prunes stale session IDs from read history', () => {
        const next = pruneSessionReadHistory(
            {
                keep: 10,
                remove: 20
            },
            new Set(['keep'])
        )

        expect(next).toEqual({ keep: 10 })
    })

    it('persists and loads read history from localStorage', () => {
        saveSessionReadHistory({ s1: 123, s2: 456 })

        expect(loadSessionReadHistory()).toEqual({ s1: 123, s2: 456 })
    })

    it('uses subdued unread style while thinking', () => {
        expect(getUnreadLabelClass(true)).toContain('opacity-70')
        expect(getUnreadLabelClass(false)).toBe('text-[var(--app-badge-warning-text)]')
    })

    it('computes clear-inactive counts by age buckets', () => {
        const now = Date.now()
        const sessions = [
            makeSession({ id: 'active', active: true, updatedAt: now - (90 * 24 * 60 * 60 * 1000) }),
            makeSession({ id: 'inactive-5d', active: false, updatedAt: now - (5 * 24 * 60 * 60 * 1000) }),
            makeSession({ id: 'inactive-10d', active: false, updatedAt: now - (10 * 24 * 60 * 60 * 1000) }),
            makeSession({ id: 'inactive-40d', active: false, updatedAt: now - (40 * 24 * 60 * 60 * 1000) }),
        ]

        expect(getClearInactiveCounts(sessions, now)).toEqual({
            '7d': 2,
            '30d': 1,
            all: 3
        })
    })
})
