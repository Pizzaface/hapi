import { describe, expect, it } from 'vitest'
import { resolveProvider } from './providerTheme'

describe('resolveProvider', () => {
    it('returns correct display for each known flavor', () => {
        expect(resolveProvider('claude')).toEqual({
            key: 'claude',
            label: 'Claude',
            colorVar: '--app-provider-claude'
        })

        expect(resolveProvider('codex')).toEqual({
            key: 'codex',
            label: 'Codex',
            colorVar: '--app-provider-codex'
        })

        expect(resolveProvider('gemini')).toEqual({
            key: 'gemini',
            label: 'Gemini',
            colorVar: '--app-provider-gemini'
        })

        expect(resolveProvider('opencode')).toEqual({
            key: 'opencode',
            label: 'OpenCode',
            colorVar: '--app-provider-opencode'
        })
    })

    it('returns unknown fallback for nullish, empty, and unknown values', () => {
        const fallback = {
            key: 'unknown',
            label: 'Unknown',
            colorVar: '--app-provider-unknown'
        }

        expect(resolveProvider(undefined)).toEqual(fallback)
        expect(resolveProvider(null)).toEqual(fallback)
        expect(resolveProvider('')).toEqual(fallback)
        expect(resolveProvider('   ')).toEqual(fallback)
        expect(resolveProvider('mystery')).toEqual(fallback)
    })

    it('normalizes flavor input and always returns non-empty label/color', () => {
        expect(resolveProvider(' CLAUDE ').key).toBe('claude')

        const results = [
            resolveProvider('claude'),
            resolveProvider('codex'),
            resolveProvider('gemini'),
            resolveProvider('opencode'),
            resolveProvider('unknown-provider')
        ]

        for (const result of results) {
            expect(result.label.length).toBeGreaterThan(0)
            expect(result.colorVar.length).toBeGreaterThan(0)
        }
    })
})
