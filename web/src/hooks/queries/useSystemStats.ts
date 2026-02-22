import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SystemStats } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSystemStats(api: ApiClient | null): {
    stats: SystemStats | null
    isLoading: boolean
} {
    const query = useQuery({
        queryKey: queryKeys.health,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getHealth()
        },
        enabled: Boolean(api),
        refetchInterval: 10_000,
    })

    return {
        stats: query.data?.system ?? null,
        isLoading: query.isLoading,
    }
}
