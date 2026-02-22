import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { BeadSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSessionBeads(api: ApiClient | null, sessionId: string | null): {
    beads: BeadSummary[]
    stale: boolean
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'

    const query = useQuery({
        queryKey: queryKeys.sessionBeads(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSessionBeads(sessionId)
        },
        enabled: Boolean(api && sessionId)
    })

    return {
        beads: query.data?.beads ?? [],
        stale: query.data?.stale ?? false,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load session beads' : null,
        refetch: query.refetch
    }
}
