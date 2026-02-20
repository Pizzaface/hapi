import { afterEach, describe, expect, it } from 'vitest'
import { getDraft, setDraft, clearDraft } from './draft-store'

describe('draft-store', () => {
    afterEach(() => {
        // Clean up all drafts between tests
        clearDraft('session-1')
        clearDraft('session-2')
    })

    describe('getDraft', () => {
        it('returns empty string for unknown session', () => {
            expect(getDraft('nonexistent')).toBe('')
        })

        it('returns saved draft text', () => {
            setDraft('session-1', 'hello world')
            expect(getDraft('session-1')).toBe('hello world')
        })
    })

    describe('setDraft', () => {
        it('stores text and retrieves it', () => {
            setDraft('session-1', 'draft text')
            expect(getDraft('session-1')).toBe('draft text')
        })

        it('overwrites previous draft for same session', () => {
            setDraft('session-1', 'first')
            setDraft('session-1', 'second')
            expect(getDraft('session-1')).toBe('second')
        })

        it('keeps drafts separate per session', () => {
            setDraft('session-1', 'one')
            setDraft('session-2', 'two')
            expect(getDraft('session-1')).toBe('one')
            expect(getDraft('session-2')).toBe('two')
        })

        it('deletes draft when text is empty', () => {
            setDraft('session-1', 'some text')
            setDraft('session-1', '')
            expect(getDraft('session-1')).toBe('')
        })

        it('deletes draft when text is whitespace-only', () => {
            setDraft('session-1', 'some text')
            setDraft('session-1', '   \n\t  ')
            expect(getDraft('session-1')).toBe('')
        })

        it('preserves leading/trailing whitespace in non-empty text', () => {
            setDraft('session-1', '  hello  ')
            expect(getDraft('session-1')).toBe('  hello  ')
        })
    })

    describe('clearDraft', () => {
        it('removes a stored draft', () => {
            setDraft('session-1', 'text')
            clearDraft('session-1')
            expect(getDraft('session-1')).toBe('')
        })

        it('is a no-op for unknown session', () => {
            // Should not throw
            clearDraft('nonexistent')
            expect(getDraft('nonexistent')).toBe('')
        })
    })
})
