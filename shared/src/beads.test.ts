import { describe, expect, it } from 'bun:test'
import { BeadSummarySchema } from './beads'

describe('BeadSummarySchema', () => {
    it('parses valid bd show output', () => {
        const parsed = BeadSummarySchema.safeParse({
            id: 'hapi-6uf',
            title: 'Beads panel',
            status: 'in_progress',
            priority: 2,
            issue_type: 'feature',
            owner: 'Allen',
            acceptance_criteria: '- show panel',
            labels: ['ui', 'beads'],
            updated_at: '2026-02-19T12:00:00Z'
        })

        expect(parsed.success).toBe(true)
    })

    it('preserves unknown fields via passthrough', () => {
        const parsed = BeadSummarySchema.parse({
            id: 'hapi-6uf',
            title: 'Beads panel',
            status: 'open',
            priority: 2,
            future_field: { nested: true }
        }) as Record<string, unknown>

        expect(parsed.future_field).toEqual({ nested: true })
    })

    it('rejects invalid payloads', () => {
        const missingId = BeadSummarySchema.safeParse({
            title: 'Missing id',
            status: 'open',
            priority: 1
        })
        const missingTitle = BeadSummarySchema.safeParse({
            id: 'hapi-6uf',
            status: 'open',
            priority: 1
        })

        expect(missingId.success).toBe(false)
        expect(missingTitle.success).toBe(false)
    })
})
