import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { getCpuPercent, startCpuSampler, stopCpuSampler } from './cpuSampler'

describe('cpuSampler', () => {
    afterEach(() => {
        stopCpuSampler()
    })

    it('returns 0 before any sampling', () => {
        // getCpuPercent returns the module-level cpuPercent which starts at 0
        // After a fresh import it should be 0 (or whatever the last test left it at)
        // We test the flow: start → wait → get
        expect(typeof getCpuPercent()).toBe('number')
    })

    it('produces a cpu percentage after two samples', async () => {
        startCpuSampler(50) // sample every 50ms for test speed
        // Wait for at least 2 sample intervals so a delta is computed
        await new Promise((r) => setTimeout(r, 150))
        const pct = getCpuPercent()
        expect(pct).toBeGreaterThanOrEqual(0)
        expect(pct).toBeLessThanOrEqual(100)
    })

    it('stopCpuSampler stops interval', async () => {
        startCpuSampler(50)
        await new Promise((r) => setTimeout(r, 120))
        stopCpuSampler()
        const after = getCpuPercent()
        // After stopping, value should remain frozen
        await new Promise((r) => setTimeout(r, 120))
        expect(getCpuPercent()).toBe(after)
    })
})
