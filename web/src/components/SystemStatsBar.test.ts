import { describe, it, expect } from 'vitest'
import { formatBytes } from './SystemStatsBar'

describe('SystemStatsBar', () => {
    describe('formatBytes', () => {
        it('formats values under 10 GB with one decimal', () => {
            const bytes = 8 * 1024 * 1024 * 1024 // 8 GB
            expect(formatBytes(bytes)).toBe('8.0')
        })

        it('formats values at or above 10 GB as integers', () => {
            const bytes = 16 * 1024 * 1024 * 1024 // 16 GB
            expect(formatBytes(bytes)).toBe('16')
        })

        it('formats fractional GB values', () => {
            const bytes = 5.7 * 1024 * 1024 * 1024
            expect(formatBytes(bytes)).toBe('5.7')
        })

        it('formats zero bytes', () => {
            expect(formatBytes(0)).toBe('0.0')
        })

        it('rounds large values', () => {
            const bytes = 31.6 * 1024 * 1024 * 1024
            expect(formatBytes(bytes)).toBe('32')
        })
    })
})
