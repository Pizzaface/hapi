import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCodexThinkingActivityEvent, ThinkingStateTracker } from './thinkingStateTracker'

describe('ThinkingStateTracker', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('starts thinking immediately when processing begins', () => {
        let thinking = false
        const changes: boolean[] = []
        const tracker = new ThinkingStateTracker({
            getThinking: () => thinking,
            onThinkingChange: (next) => {
                thinking = next
                changes.push(next)
            }
        })

        tracker.startProcessing()

        expect(thinking).toBe(true)
        expect(changes).toEqual([true])
    })

    it('keeps thinking true while trailing output activity continues after completion signal', () => {
        let thinking = false
        const tracker = new ThinkingStateTracker({
            getThinking: () => thinking,
            onThinkingChange: (next) => {
                thinking = next
            },
            settleDelayMs: 200
        })

        tracker.startProcessing()
        tracker.markSettledSoon()

        vi.advanceTimersByTime(150)
        tracker.markActivity()

        vi.advanceTimersByTime(120)
        expect(thinking).toBe(true)

        vi.advanceTimersByTime(200)
        expect(thinking).toBe(false)
    })

    it('resets immediately on abort', () => {
        let thinking = false
        const tracker = new ThinkingStateTracker({
            getThinking: () => thinking,
            onThinkingChange: (next) => {
                thinking = next
            },
            settleDelayMs: 500
        })

        tracker.startProcessing()
        tracker.markSettledSoon()

        tracker.reset()

        expect(thinking).toBe(false)
        vi.advanceTimersByTime(1000)
        expect(thinking).toBe(false)
    })
})

describe('isCodexThinkingActivityEvent', () => {
    it('treats known output events as activity', () => {
        expect(isCodexThinkingActivityEvent('agent_message')).toBe(true)
        expect(isCodexThinkingActivityEvent('response_item')).toBe(true)
        expect(isCodexThinkingActivityEvent('web_search_end')).toBe(true)
    })

    it('ignores completion-only events', () => {
        expect(isCodexThinkingActivityEvent('task_complete')).toBe(false)
        expect(isCodexThinkingActivityEvent('turn_aborted')).toBe(false)
        expect(isCodexThinkingActivityEvent('task_failed')).toBe(false)
    })
})
