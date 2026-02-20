import { describe, it, expect } from 'vitest'
import { z } from 'zod'

/**
 * The spawn_session MCP schema uses z.preprocess to coerce string booleans
 * from XML-based tool calls (where all values arrive as strings) into actual
 * booleans. This test validates that pattern handles all input variants.
 */
const yoloSchema = z.preprocess(
    v => v === 'true' ? true : v === 'false' ? false : v,
    z.boolean()
).optional()

describe('spawn_session yolo parameter coercion', () => {
    it('accepts boolean true', () => {
        expect(yoloSchema.parse(true)).toBe(true)
    })

    it('accepts boolean false', () => {
        expect(yoloSchema.parse(false)).toBe(false)
    })

    it('coerces string "true" to boolean true', () => {
        expect(yoloSchema.parse('true')).toBe(true)
    })

    it('coerces string "false" to boolean false', () => {
        expect(yoloSchema.parse('false')).toBe(false)
    })

    it('accepts undefined (optional)', () => {
        expect(yoloSchema.parse(undefined)).toBeUndefined()
    })

    it('rejects other strings', () => {
        expect(() => yoloSchema.parse('yes')).toThrow()
        expect(() => yoloSchema.parse('1')).toThrow()
    })

    it('rejects non-boolean non-string values', () => {
        expect(() => yoloSchema.parse(1)).toThrow()
        expect(() => yoloSchema.parse(null)).toThrow()
    })
})
