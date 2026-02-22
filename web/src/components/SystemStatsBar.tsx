import type { SystemStats } from '@/types/api'

export function formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    return gb >= 10 ? `${Math.round(gb)}` : `${gb.toFixed(1)}`
}

function MiniBar(props: { percent: number; label: string; value: string }) {
    return (
        <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-[var(--app-hint)] shrink-0">{props.label}</span>
            <div className="h-1 flex-1 min-w-[32px] rounded-full bg-[var(--app-border)] overflow-hidden">
                <div
                    className="h-full rounded-full bg-[var(--app-hint)] transition-[width] duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, props.percent))}%` }}
                />
            </div>
            <span className="text-[10px] text-[var(--app-hint)] shrink-0 tabular-nums">{props.value}</span>
        </div>
    )
}

export function SystemStatsBar(props: { stats: SystemStats | null }) {
    if (!props.stats) {
        return null
    }

    const { cpuPercent, memUsedBytes, memTotalBytes } = props.stats
    const memPercent = memTotalBytes > 0 ? (memUsedBytes / memTotalBytes) * 100 : 0

    return (
        <div className="px-3 py-1.5 border-t border-[var(--app-divider)] flex flex-col gap-0.5">
            <MiniBar percent={cpuPercent} label="CPU" value={`${cpuPercent}%`} />
            <MiniBar
                percent={memPercent}
                label="RAM"
                value={`${formatBytes(memUsedBytes)}/${formatBytes(memTotalBytes)} GB`}
            />
        </div>
    )
}
