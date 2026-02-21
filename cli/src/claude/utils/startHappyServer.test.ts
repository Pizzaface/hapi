import { describe, it, expect } from 'vitest'
import { toJSONSchema } from 'zod/v4-mini'
import { spawnSessionInputSchema } from './startHappyServer'

/**
 * The spawn_session MCP schema uses z.union with z.literal().transform()
 * to coerce string booleans from XML-based tool calls into actual booleans.
 * Unlike z.preprocess, this approach produces JSON Schema that accepts both
 * boolean and string types, so the MCP SDK's JSON Schema validation passes
 * before Zod parsing runs.
 */

const parse = (input: Record<string, unknown>) =>
    spawnSessionInputSchema.parse(input) as Record<string, unknown>

describe('spawn_session yolo parameter coercion', () => {
    it('accepts boolean true', () => {
        expect(parse({ directory: '/tmp', yolo: true }).yolo).toBe(true)
    })

    it('accepts boolean false', () => {
        expect(parse({ directory: '/tmp', yolo: false }).yolo).toBe(false)
    })

    it('coerces string "true" to boolean true', () => {
        expect(parse({ directory: '/tmp', yolo: 'true' }).yolo).toBe(true)
    })

    it('coerces string "false" to boolean false', () => {
        expect(parse({ directory: '/tmp', yolo: 'false' }).yolo).toBe(false)
    })

    it('accepts undefined (optional)', () => {
        expect(parse({ directory: '/tmp' }).yolo).toBeUndefined()
    })

    it('rejects other strings', () => {
        expect(() => spawnSessionInputSchema.parse({ directory: '/tmp', yolo: 'yes' })).toThrow()
        expect(() => spawnSessionInputSchema.parse({ directory: '/tmp', yolo: '1' })).toThrow()
    })

    it('rejects non-boolean non-string values', () => {
        expect(() => spawnSessionInputSchema.parse({ directory: '/tmp', yolo: 1 })).toThrow()
        expect(() => spawnSessionInputSchema.parse({ directory: '/tmp', yolo: null })).toThrow()
    })
})

describe('spawn_session JSON Schema regression', () => {
    it('yolo property accepts string type in JSON Schema (not just boolean)', () => {
        // Use the same JSON Schema converter the MCP SDK uses for Zod v4
        const jsonSchema = toJSONSchema(spawnSessionInputSchema, { target: 'draft-7', io: 'input' }) as Record<string, any>
        const yoloProp = jsonSchema.properties?.yolo

        // The yolo field uses z.union([z.boolean(), z.literal('true'), z.literal('false')])
        // which must produce a JSON Schema with anyOf that includes string types.
        // If someone regresses to z.preprocess, this would be { type: "boolean" } only,
        // and the MCP SDK's JSON Schema validation would reject string "true"/"false".
        expect(yoloProp).toBeDefined()
        expect(yoloProp.anyOf).toBeDefined()

        // Collect all types accepted by the schema
        const acceptedTypes = new Set<string>()
        for (const variant of yoloProp.anyOf) {
            if (variant.type) acceptedTypes.add(variant.type)
        }

        expect(acceptedTypes.has('string'), 'JSON Schema for yolo must accept string type').toBe(true)
        expect(acceptedTypes.has('boolean'), 'JSON Schema for yolo must accept boolean type').toBe(true)
    })
})
