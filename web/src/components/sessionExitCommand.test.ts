import { describe, expect, it } from 'vitest'
import { isExitSlashCommand } from './sessionExitCommand'

describe('SessionChat /exit interception', () => {
    it('matches exact /exit (trimmed, case-insensitive)', () => {
        expect(isExitSlashCommand('/exit')).toBe(true)
        expect(isExitSlashCommand('  /ExIt  ')).toBe(true)
    })

    it('does not match /exiting', () => {
        expect(isExitSlashCommand('/exiting')).toBe(false)
    })

    it('does not match /exit now', () => {
        expect(isExitSlashCommand('/exit now')).toBe(false)
    })
})
