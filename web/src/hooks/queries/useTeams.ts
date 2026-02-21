import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useTeams(api: ApiClient | null): {
    teams: TeamSummary[]
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.teams,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getTeams()
        },
        enabled: Boolean(api),
    })

    return {
        teams: query.data?.teams ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load teams' : null,
    }
}
