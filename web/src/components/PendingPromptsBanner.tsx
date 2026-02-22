import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { ApiClient } from '@/api/client'
import { useSessions } from '@/hooks/queries/useSessions'
import { useTranslation } from '@/lib/use-translation'
import type { SessionSummary } from '@/types/api'

export type PendingPromptsSummary = {
    totalPrompts: number
    sessionsWithPending: SessionSummary[]
}

function getSessionTitle(session: SessionSummary): string {
    if (session.metadata?.name) return session.metadata.name
    if (session.metadata?.summary?.text) return session.metadata.summary.text
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts[parts.length - 1] ?? session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

export function summarizePendingPrompts(sessions: SessionSummary[], excludeSessionId?: string | null): PendingPromptsSummary {
    const sessionsWithPending = sessions
        .filter(session => session.pendingRequestsCount > 0 && session.id !== excludeSessionId)
        .sort((a, b) => {
            if (a.pendingRequestsCount !== b.pendingRequestsCount) {
                return b.pendingRequestsCount - a.pendingRequestsCount
            }
            return b.updatedAt - a.updatedAt
        })

    const totalPrompts = sessionsWithPending.reduce(
        (sum, session) => sum + session.pendingRequestsCount,
        0
    )

    return {
        totalPrompts,
        sessionsWithPending
    }
}

export function PendingPromptsBanner(props: {
    api: ApiClient | null
    currentSessionId?: string | null
}) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { sessions } = useSessions(props.api)

    const summary = useMemo(
        () => summarizePendingPrompts(sessions, props.currentSessionId),
        [sessions, props.currentSessionId]
    )

    if (summary.totalPrompts <= 0) {
        return null
    }

    const primarySession = summary.sessionsWithPending[0]
    if (!primarySession) {
        return null
    }

    const primaryName = getSessionTitle(primarySession)

    return (
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+5.5rem)] z-40 flex justify-center px-3 pointer-events-none">
            <button
                type="button"
                className="pointer-events-auto inline-flex w-full max-w-md items-center gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50/95 px-4 py-2.5 text-xs font-medium text-amber-900 shadow-lg backdrop-blur-sm transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
                onClick={() => {
                    navigate({
                        to: '/sessions/$sessionId',
                        params: { sessionId: primarySession.id }
                    })
                }}
            >
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                    {summary.totalPrompts}
                </span>
                <span className="min-w-0 flex-1 truncate">
                    {t('pendingPrompts.message', {
                        n: summary.totalPrompts,
                        m: summary.sessionsWithPending.length,
                        name: primaryName
                    })}
                </span>
                <span className="shrink-0 text-xs text-amber-600 dark:text-amber-300">
                    {t('pendingPrompts.open')}
                </span>
            </button>
        </div>
    )
}
