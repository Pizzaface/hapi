import { describe, it, expect } from 'vitest'

/**
 * Tests for the "unread" state lifecycle in the web UI.
 *
 * The "unread" indicator shows in the sidebar when a session has new
 * content that the user hasn't viewed yet (session updated while not selected).
 *
 * This file tests the pure logic, independent of React rendering.
 */

type UnreadTracker = {
    selectedSessionId: string | null
    /** Per-session unread tracking */
    unreadSessionIds: Set<string>
    /** Previous updatedAt per session */
    prevUpdatedAt: Map<string, number>
    /** Previous active state per session */
    prevActive: Map<string, boolean>
}

function createTracker(): UnreadTracker {
    return {
        selectedSessionId: null,
        unreadSessionIds: new Set(),
        prevUpdatedAt: new Map(),
        prevActive: new Map(),
    }
}

// --- SessionList logic ---

/** Simulates session list update with new updatedAt timestamps */
function onSessionsUpdate(
    tracker: UnreadTracker,
    sessions: Array<{ id: string; updatedAt: number; active?: boolean }>
) {
    const nextUpdatedAt = new Map<string, number>()
    const nextActive = new Map<string, boolean>()

    for (const s of sessions) {
        const active = s.active ?? true
        nextUpdatedAt.set(s.id, s.updatedAt)
        nextActive.set(s.id, active)

        if (s.id === tracker.selectedSessionId) continue

        const prevTs = tracker.prevUpdatedAt.get(s.id)
        const wasActive = tracker.prevActive.get(s.id)

        const updatedAtBumped = prevTs !== undefined && s.updatedAt > prevTs
        // Agent finished: was active, now inactive
        const becameInactive = wasActive === true && !active

        if (updatedAtBumped || becameInactive) {
            tracker.unreadSessionIds.add(s.id)
        }
    }

    tracker.prevUpdatedAt = nextUpdatedAt
    tracker.prevActive = nextActive
}

/** Simulates user selecting a session in the list */
function onSelectSession(tracker: UnreadTracker, sessionId: string) {
    tracker.selectedSessionId = sessionId
    tracker.unreadSessionIds.delete(sessionId)
}

describe('Unread state lifecycle - SessionList', () => {
    it('marks session as unread when updatedAt increases while not selected', () => {
        const t = createTracker()

        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)

        onSessionsUpdate(t, [{ id: 's1', updatedAt: 200 }])
        expect(t.unreadSessionIds.has('s1')).toBe(true)
    })

    it('does not mark session as unread on initial load', () => {
        const t = createTracker()

        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
    })

    it('does not mark session as unread when it is currently selected', () => {
        const t = createTracker()

        onSelectSession(t, 's1')
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 200 }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
    })

    it('clears unread when session is selected', () => {
        const t = createTracker()

        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 200 }])
        expect(t.unreadSessionIds.has('s1')).toBe(true)

        onSelectSession(t, 's1')
        expect(t.unreadSessionIds.has('s1')).toBe(false)
    })

    it('does not mark unread when updatedAt stays the same', () => {
        const t = createTracker()

        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
    })

    it('tracks unread state independently across multiple sessions', () => {
        const t = createTracker()

        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 100 },
            { id: 's2', updatedAt: 100 },
        ])

        // s1 updates, s2 stays the same
        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 200 },
            { id: 's2', updatedAt: 100 },
        ])
        expect(t.unreadSessionIds.has('s1')).toBe(true)
        expect(t.unreadSessionIds.has('s2')).toBe(false)

        // s2 updates
        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 200 },
            { id: 's2', updatedAt: 200 },
        ])
        expect(t.unreadSessionIds.has('s1')).toBe(true)
        expect(t.unreadSessionIds.has('s2')).toBe(true)

        // User opens s1
        onSelectSession(t, 's1')
        expect(t.unreadSessionIds.has('s1')).toBe(false)
        expect(t.unreadSessionIds.has('s2')).toBe(true)
    })

    it('handles rapid updates correctly', () => {
        const t = createTracker()

        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100 }])
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 200 }])
        expect(t.unreadSessionIds.has('s1')).toBe(true)

        // User views it
        onSelectSession(t, 's1')
        expect(t.unreadSessionIds.has('s1')).toBe(false)

        // Another update while still viewing → not unread (selected)
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 300 }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)

        // Switch away, then s1 updates → unread again
        onSelectSession(t, 's2')
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 400 }])
        expect(t.unreadSessionIds.has('s1')).toBe(true)
    })

    it('marks unread for background session when selected session also updates', () => {
        const t = createTracker()

        onSelectSession(t, 's1')
        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 100 },
            { id: 's2', updatedAt: 100 },
        ])

        // Both update, but s1 is selected
        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 200 },
            { id: 's2', updatedAt: 200 },
        ])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
        expect(t.unreadSessionIds.has('s2')).toBe(true)
    })

    it('marks session as unread when agent finishes (active→inactive) even without updatedAt change', () => {
        const t = createTracker()

        // Session starts active
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100, active: true }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)

        // Agent finishes — active flips to false but updatedAt stays the same
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100, active: false }])
        expect(t.unreadSessionIds.has('s1')).toBe(true)
    })

    it('does not mark unread when active session finishes while selected', () => {
        const t = createTracker()

        onSelectSession(t, 's1')
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100, active: true }])

        // Agent finishes while user is viewing the session
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100, active: false }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
    })

    it('does not re-trigger unread for sessions that are already inactive', () => {
        const t = createTracker()

        // Session is already inactive
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100, active: false }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)

        // Still inactive on next poll — no spurious unread
        onSessionsUpdate(t, [{ id: 's1', updatedAt: 100, active: false }])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
    })

    it('marks unread when background agent finishes while viewing another session', () => {
        const t = createTracker()

        onSelectSession(t, 's1')
        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 100, active: true },
            { id: 's2', updatedAt: 100, active: true },
        ])

        // s2 agent finishes while user is viewing s1
        onSessionsUpdate(t, [
            { id: 's1', updatedAt: 100, active: true },
            { id: 's2', updatedAt: 100, active: false },
        ])
        expect(t.unreadSessionIds.has('s1')).toBe(false)
        expect(t.unreadSessionIds.has('s2')).toBe(true)
    })
})
