import { cpus } from 'node:os'

let prevIdle = 0
let prevTotal = 0
let cpuPercent = 0
let timer: ReturnType<typeof setInterval> | null = null

function sample() {
    const cores = cpus()
    let idle = 0
    let total = 0
    for (const core of cores) {
        const { user, nice, sys, irq, idle: coreIdle } = core.times
        idle += coreIdle
        total += user + nice + sys + irq + coreIdle
    }

    if (prevTotal > 0) {
        const deltaIdle = idle - prevIdle
        const deltaTotal = total - prevTotal
        cpuPercent = deltaTotal > 0
            ? Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)
            : 0
    }

    prevIdle = idle
    prevTotal = total
}

export function startCpuSampler(intervalMs = 5000) {
    sample() // seed initial values
    timer = setInterval(sample, intervalMs)
}

export function stopCpuSampler() {
    if (timer) {
        clearInterval(timer)
        timer = null
    }
}

export function getCpuPercent(): number {
    return cpuPercent
}
