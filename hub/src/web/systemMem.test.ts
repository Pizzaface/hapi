import { describe, it, expect } from 'bun:test'
import { totalmem } from 'node:os'
import { getMemUsedBytes } from './systemMem'

describe('getMemUsedBytes', () => {
    it('returns a positive number less than total memory', () => {
        const used = getMemUsedBytes()
        expect(used).toBeGreaterThan(0)
        expect(used).toBeLessThan(totalmem())
    })

    it('returns a reasonable fraction of total memory', () => {
        const used = getMemUsedBytes()
        const total = totalmem()
        const ratio = used / total
        // Should be between 1% and 99%
        expect(ratio).toBeGreaterThan(0.01)
        expect(ratio).toBeLessThan(0.99)
    })
})
