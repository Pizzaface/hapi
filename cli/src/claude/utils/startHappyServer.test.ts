import { describe, it, expect } from 'vitest'
import { z } from 'zod'

/**
 * The spawn_session MCP schema uses z.union with z.literal().transform()
 * to coerce string booleans from XML-based tool calls into actual booleans.
 * Unlike z.preprocess, this approach produces JSON Schema that accepts both
 * boolean and string types, so the MCP SDK's JSON Schema validation passes
 * before Zod parsing runs.
 */
const yoloSchema = z.union([
    z.boolean(),
    z.literal('true').transform(() => true),
    z.literal('false').transform(() => false)
]).optional()

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
