import { describe, expect, it } from 'vitest'
import type { SessionStatusKey } from '@hapi/protocol'
import {
    SESSION_STATUS_DISPLAY,
    getSessionStatusDisplay,
} from './sessionStatusDisplay'

describe('SESSION_STATUS_DISPLAY', () => {
    it('has entries for all v1 status keys', () => {
        const keys: SessionStatusKey[] = ['waiting-for-permission', 'thinking', 'idle', 'offline']
        for (const key of keys) {
            expect(SESSION_STATUS_DISPLAY[key]).toBeDefined()
        }
    })

    it('waiting-for-permission uses amber dot and pulses', () => {
        const display = SESSION_STATUS_DISPLAY['waiting-for-permission']
        expect(display.dotClass).toContain('warning')
        expect(display.animate).toBe(true)
        expect(display.i18nKey).toBe('session.status.needsInput')
    })

    it('thinking uses blue dot and pulses', () => {
        const display = SESSION_STATUS_DISPLAY['thinking']
        expect(display.dotClass).toContain('#007AFF')
        expect(display.animate).toBe(true)
        expect(display.i18nKey).toBe('session.status.thinking')
    })

    it('idle uses green dot without pulse', () => {
        const display = SESSION_STATUS_DISPLAY['idle']
        expect(display.dotClass).toContain('success')
        expect(display.animate).toBe(false)
        expect(display.i18nKey).toBe('session.status.idle')
    })

    it('offline uses gray dot without pulse and no label', () => {
        const display = SESSION_STATUS_DISPLAY['offline']
        expect(display.dotClass).toContain('hint')
        expect(display.animate).toBe(false)
        expect(display.i18nKey).toBeNull()
    })
})

describe('getSessionStatusDisplay', () => {
    it('returns correct display for known status', () => {
        expect(getSessionStatusDisplay('thinking')).toBe(SESSION_STATUS_DISPLAY['thinking'])
    })

    it('falls back to gray dot for unknown status key', () => {
        const display = getSessionStatusDisplay('some-future-status')
        expect(display.dotClass).toContain('hint')
        expect(display.animate).toBe(false)
        expect(display.i18nKey).toBeNull()
    })
})
