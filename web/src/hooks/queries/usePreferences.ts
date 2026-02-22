import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { PreferencesResponse, TeamGroupStyle } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function usePreferences(api: ApiClient | null): {
    teamGroupStyle: TeamGroupStyle
    isLoading: boolean
} {
    const query = useQuery({
        queryKey: queryKeys.preferences,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getPreferences()
        },
        enabled: Boolean(api),
        staleTime: 60_000,
    })

    return {
        teamGroupStyle: query.data?.teamGroupStyle ?? 'card',
        isLoading: query.isLoading,
    }
}
