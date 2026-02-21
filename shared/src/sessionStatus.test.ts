import { describe, expect, it } from 'bun:test'
import {
    deriveSessionStatus,
    SESSION_STATUS_PRIORITY,
    type SessionStatusInput,
    type SessionStatusKey,
} from './sessionStatus'

function input(overrides: Partial<SessionStatusInput> = {}): SessionStatusInput {
    return {
        active: true,
        thinking: false,
        pendingRequestsCount: 0,
        ...overrides,
    }
}

describe('deriveSessionStatus', () => {
    it('returns "offline" when session is not active', () => {
        expect(deriveSessionStatus(input({ active: false }))).toBe('offline')
    })

    it('returns "offline" even when thinking + pending if inactive', () => {
        expect(
            deriveSessionStatus(input({ active: false, thinking: true, pendingRequestsCount: 3 }))
        ).toBe('offline')
    })

    it('returns "waiting-for-permission" when active with pending requests', () => {
        expect(
            deriveSessionStatus(input({ pendingRequestsCount: 1 }))
        ).toBe('waiting-for-permission')
    })

    it('returns "waiting-for-permission" even when also thinking (higher priority)', () => {
        expect(
            deriveSessionStatus(input({ thinking: true, pendingRequestsCount: 2 }))
        ).toBe('waiting-for-permission')
    })

    it('returns "thinking" when active, thinking, and no pending requests', () => {
        expect(
            deriveSessionStatus(input({ thinking: true }))
        ).toBe('thinking')
    })

    it('returns "idle" when active, not thinking, no pending', () => {
        expect(deriveSessionStatus(input())).toBe('idle')
    })

    it('returns "idle" when pendingRequestsCount is exactly 0', () => {
        expect(
            deriveSessionStatus(input({ pendingRequestsCount: 0 }))
        ).toBe('idle')
    })

    it('treats inactive as highest override regardless of other flags', () => {
        expect(
            deriveSessionStatus(input({ active: false, thinking: true }))
        ).toBe('offline')
        expect(
            deriveSessionStatus(input({ active: false, pendingRequestsCount: 5 }))
        ).toBe('offline')
    })
})

describe('SESSION_STATUS_PRIORITY', () => {
    it('ranks waiting-for-permission highest (lowest number)', () => {
        const sorted = (Object.keys(SESSION_STATUS_PRIORITY) as SessionStatusKey[]).sort(
            (a, b) => SESSION_STATUS_PRIORITY[a] - SESSION_STATUS_PRIORITY[b]
        )
        expect(sorted[0]).toBe('waiting-for-permission')
    })

    it('ranks offline lowest (highest number)', () => {
        const sorted = (Object.keys(SESSION_STATUS_PRIORITY) as SessionStatusKey[]).sort(
            (a, b) => SESSION_STATUS_PRIORITY[a] - SESSION_STATUS_PRIORITY[b]
        )
        expect(sorted[sorted.length - 1]).toBe('offline')
    })

    it('has unique priority values', () => {
        const values = Object.values(SESSION_STATUS_PRIORITY)
        expect(new Set(values).size).toBe(values.length)
    })
})
