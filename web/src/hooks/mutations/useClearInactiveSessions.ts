import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type {
    ClearInactiveSessionsOlderThan,
    ClearInactiveSessionsResponse
} from '@/types/api'
import { clearMessageWindow } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'

export function useClearInactiveSessions(
    api: ApiClient | null
): {
    clearInactiveSessions: (olderThan: ClearInactiveSessionsOlderThan) => Promise<ClearInactiveSessionsResponse>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (olderThan: ClearInactiveSessionsOlderThan) => {
            if (!api) {
                throw new Error('Session unavailable')
            }

            return await api.clearInactiveSessions(olderThan)
        },
        onSuccess: async (result) => {
            for (const sessionId of result.deleted) {
                queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) })
                clearMessageWindow(sessionId)
            }

            await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        }
    })

    return {
        clearInactiveSessions: mutation.mutateAsync,
        isPending: mutation.isPending
    }
}
