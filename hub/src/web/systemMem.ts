import { readFileSync } from 'node:fs'
import { freemem, totalmem, platform } from 'node:os'

/**
 * Get actual memory used (total - available) using /proc/meminfo on Linux.
 * Falls back to os.totalmem() - os.freemem() on other platforms.
 *
 * os.freemem() returns "free" memory which excludes buffers/cache,
 * making usage appear much higher than what tools like htop/free report.
 * /proc/meminfo MemAvailable accounts for reclaimable cache.
 */
export function getMemUsedBytes(): number {
    if (platform() === 'linux') {
        try {
            const meminfo = readFileSync('/proc/meminfo', 'utf8')
            const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)
            if (match?.[1]) {
                const availableKb = parseInt(match[1], 10)
                return totalmem() - (availableKb * 1024)
            }
        } catch {
            // fall through to os.freemem()
        }
    }
    return totalmem() - freemem()
}
