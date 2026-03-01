import { describe, expect, it } from 'bun:test'
import { constantTimeEquals } from './crypto'

describe('constantTimeEquals', () => {
    it('returns true for equal strings', () => {
        expect(constantTimeEquals('hello', 'hello')).toBe(true)
    })

    it('returns false for different strings of the same length', () => {
        expect(constantTimeEquals('hello', 'world')).toBe(false)
    })

    it('returns false for different strings of different lengths', () => {
        expect(constantTimeEquals('hello', 'helloworld')).toBe(false)
        expect(constantTimeEquals('helloworld', 'hello')).toBe(false)
    })

    it('returns true for two empty strings', () => {
        expect(constantTimeEquals('', '')).toBe(true)
    })

    it('returns false when one string is empty and the other is not', () => {
        expect(constantTimeEquals('', 'a')).toBe(false)
        expect(constantTimeEquals('a', '')).toBe(false)
    })

    it('returns false when either or both arguments are null', () => {
        expect(constantTimeEquals(null, 'hello')).toBe(false)
        expect(constantTimeEquals('hello', null)).toBe(false)
        expect(constantTimeEquals(null, null)).toBe(false)
    })

    it('returns false when either or both arguments are undefined', () => {
        expect(constantTimeEquals(undefined, 'hello')).toBe(false)
        expect(constantTimeEquals('hello', undefined)).toBe(false)
        expect(constantTimeEquals(undefined, undefined)).toBe(false)
    })

    it('returns false for null vs undefined', () => {
        expect(constantTimeEquals(null, undefined)).toBe(false)
        expect(constantTimeEquals(undefined, null)).toBe(false)
    })

    it('handles multibyte characters / emojis correctly', () => {
        expect(constantTimeEquals('👋🌍', '👋🌍')).toBe(true)
        expect(constantTimeEquals('👋🌍', '👋🌎')).toBe(false)
    })
})
