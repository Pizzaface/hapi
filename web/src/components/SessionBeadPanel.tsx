import { useMemo, useState } from 'react'
import type { BeadSummary } from '@/types/api'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-[var(--app-hint)] transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

const STATUS_STYLES: Record<string, string> = {
    open: 'border-gray-400/40 bg-gray-500/15 text-gray-600 dark:text-gray-300',
    in_progress: 'border-blue-400/40 bg-blue-500/15 text-blue-600 dark:text-blue-300',
    done: 'border-green-400/40 bg-green-500/15 text-green-600 dark:text-green-300',
    blocked: 'border-red-400/40 bg-red-500/15 text-red-600 dark:text-red-300',
    deferred: 'border-amber-400/40 bg-amber-500/15 text-amber-600 dark:text-amber-300'
}

function formatStatus(status: string): string {
    return status.replace(/_/g, ' ').trim()
}

function statusClass(status: string): string {
    return STATUS_STYLES[status] ?? 'border-gray-400/40 bg-gray-500/15 text-gray-600 dark:text-gray-300'
}

export function SessionBeadPanel({ beads, stale }: { beads: BeadSummary[] | undefined; stale: boolean }) {
    const [isCollapsed, setIsCollapsed] = useState(false)

    const sortedBeads = useMemo(() => {
        return [...(beads ?? [])].sort((a, b) => a.priority - b.priority)
    }, [beads])

    if (sortedBeads.length === 0) {
        return null
    }

    return (
        <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)]">
            <div className="mx-auto w-full max-w-content">
                <button
                    type="button"
                    onClick={() => setIsCollapsed((prev) => !prev)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    aria-expanded={!isCollapsed}
                >
                    <ChevronIcon collapsed={isCollapsed} />
                    <span className="flex-1 text-xs font-medium text-[var(--app-fg)]">
                        Beads
                        <span className="ml-1.5 font-normal text-[var(--app-hint)]">{sortedBeads.length}</span>
                    </span>
                    {stale ? (
                        <span className="text-xs text-[var(--app-hint)]">(stale)</span>
                    ) : null}
                </button>

                <div className={`overflow-hidden transition-all duration-200 ${isCollapsed ? 'max-h-0' : 'max-h-[40vh] overflow-y-auto'}`}>
                    <div className="flex flex-col gap-2 px-3 pb-3">
                        {sortedBeads.map((bead) => {
                            const criteria = typeof bead.acceptance_criteria === 'string' ? bead.acceptance_criteria.trim() : ''
                            return (
                                <div
                                    key={bead.id}
                                    className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-[var(--app-fg)]">{bead.title}</div>
                                        </div>
                                        <span
                                            data-testid={`bead-status-${bead.id}`}
                                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(bead.status)}`}
                                        >
                                            {formatStatus(bead.status)}
                                        </span>
                                        <span className="rounded border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-1.5 py-0.5 text-[11px] text-[var(--app-hint)]">
                                            P{bead.priority}
                                        </span>
                                    </div>

                                    {criteria ? (
                                        <div className="mt-2 text-xs text-[var(--app-fg)]">
                                            <MarkdownRenderer content={criteria} />
                                        </div>
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
