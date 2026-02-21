import { describe, expect, it, beforeEach } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import {
    clearMessageWindow,
    flushPendingMessages,
    getMessageWindowState,
    ingestIncomingMessages,
    setAtBottom,
    setPendingPermissionRequestIds,
    subscribeMessageWindow,
    PENDING_WINDOW_SIZE,
} from '@/lib/message-window-store'

function makeMsg(id: string, seq: number, overrides?: Partial<DecryptedMessage>): DecryptedMessage {
    return {
        id,
        seq,
        localId: null,
        content: { role: 'agent', content: { type: 'output', data: { type: 'assistant', uuid: id, message: { content: `text-${id}` } } } },
        createdAt: 1700000000000 + seq,
        ...overrides
    }
}

function makeToolCallMsg(id: string, seq: number, toolCallId: string): DecryptedMessage {
    return {
        id,
        seq,
        localId: null,
        content: {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    uuid: id,
                    message: {
                        content: [
                            { type: 'tool_use', id: toolCallId, name: 'Bash', input: { command: 'ls' } }
                        ]
                    }
                }
            }
        },
        createdAt: 1700000000000 + seq,
    }
}

describe('message-window-store: permission prompt handling', () => {
    const SID = 'test-session'

    beforeEach(() => {
        clearMessageWindow(SID)
        // Ensure subscription exists so state is tracked
        const unsub = subscribeMessageWindow(SID, () => {})
        // We'll clean up after each test by clearing
        return () => {
            clearMessageWindow(SID)
            unsub()
        }
    })

    describe('hasPendingPermissionPrompt', () => {
        it('defaults to false', () => {
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(false)
        })

        it('is true when pending contains a message matching a pending permission request ID', () => {
            setAtBottom(SID, false)
            ingestIncomingMessages(SID, [makeToolCallMsg('msg-1', 1, 'req-abc')])
            setPendingPermissionRequestIds(SID, new Set(['req-abc']))
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(true)
        })

        it('is false when atBottom is true (messages go directly to visible)', () => {
            setAtBottom(SID, true)
            ingestIncomingMessages(SID, [makeToolCallMsg('msg-1', 1, 'req-abc')])
            setPendingPermissionRequestIds(SID, new Set(['req-abc']))
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(false)
        })

        it('is false when pending has no matching messages', () => {
            setAtBottom(SID, false)
            ingestIncomingMessages(SID, [makeMsg('msg-1', 1)])
            setPendingPermissionRequestIds(SID, new Set(['req-xyz']))
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(false)
        })

        it('clears after flush', () => {
            setAtBottom(SID, false)
            ingestIncomingMessages(SID, [makeToolCallMsg('msg-1', 1, 'req-abc')])
            setPendingPermissionRequestIds(SID, new Set(['req-abc']))
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(true)

            flushPendingMessages(SID)
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(false)
        })

        it('clears when pending permission request IDs are emptied', () => {
            setAtBottom(SID, false)
            ingestIncomingMessages(SID, [makeToolCallMsg('msg-1', 1, 'req-abc')])
            setPendingPermissionRequestIds(SID, new Set(['req-abc']))
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(true)

            setPendingPermissionRequestIds(SID, new Set())
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(false)
        })
    })

    describe('permission prompt messages are non-droppable in trimPending', () => {
        it('preserves permission prompt messages when pending queue overflows', () => {
            setAtBottom(SID, false)

            // Set pending permission request IDs first
            setPendingPermissionRequestIds(SID, new Set(['req-keep']))

            // Fill pending with messages up to and beyond PENDING_WINDOW_SIZE
            const filler: DecryptedMessage[] = []
            for (let i = 0; i < PENDING_WINDOW_SIZE + 10; i++) {
                filler.push(makeMsg(`filler-${i}`, i))
            }
            // Insert the permission prompt message at the start (oldest, first to be trimmed)
            const permMsg = makeToolCallMsg('perm-msg', -1, 'req-keep')
            ingestIncomingMessages(SID, [permMsg, ...filler])

            const state = getMessageWindowState(SID)
            // The permission prompt message should still be in pending (not dropped)
            const pendingIds = state.pending.map(m => m.id)
            expect(pendingIds).toContain('perm-msg')
        })
    })

    describe('setPendingPermissionRequestIds', () => {
        it('updates pending permission request IDs in state', () => {
            setPendingPermissionRequestIds(SID, new Set(['req-1', 'req-2']))
            // The IDs are internal state; verify through behavior
            setAtBottom(SID, false)
            ingestIncomingMessages(SID, [makeToolCallMsg('msg-1', 1, 'req-1')])
            expect(getMessageWindowState(SID).hasPendingPermissionPrompt).toBe(true)
        })
    })

    describe('no regression for normal message flow', () => {
        it('non-prompt messages still follow existing pending/flush logic when atBottom is false', () => {
            setAtBottom(SID, false)
            ingestIncomingMessages(SID, [makeMsg('msg-1', 1), makeMsg('msg-2', 2)])

            const state = getMessageWindowState(SID)
            expect(state.pending.length).toBe(2)
            expect(state.messages.length).toBe(0)
            expect(state.pendingCount).toBeGreaterThan(0)
        })

        it('messages go directly to visible when atBottom is true', () => {
            setAtBottom(SID, true)
            ingestIncomingMessages(SID, [makeMsg('msg-1', 1)])

            const state = getMessageWindowState(SID)
            expect(state.messages.length).toBe(1)
            expect(state.pending.length).toBe(0)
        })
    })
})
