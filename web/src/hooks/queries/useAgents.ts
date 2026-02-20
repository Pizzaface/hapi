import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { MachineAgent } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

const DIRECTORY_DEBOUNCE_MS = 250

export function useAgents(
    api: ApiClient | null,
    machineId: string | null,
    directory: string,
    enabled: boolean = true
): {
    agents: MachineAgent[]
    isLoading: boolean
    error: string | null
} {
    const trimmedDirectory = directory.trim()
    const [debouncedDirectory, setDebouncedDirectory] = useState(trimmedDirectory)

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedDirectory(trimmedDirectory)
        }, DIRECTORY_DEBOUNCE_MS)

        return () => {
            clearTimeout(timeout)
        }
    }, [trimmedDirectory])

    const query = useQuery({
        queryKey: queryKeys.machineAgents(machineId ?? '', debouncedDirectory),
        queryFn: async () => {
            if (!api || !machineId || !debouncedDirectory) {
                return { agents: [] }
            }

            return await api.listMachineAgents(machineId, debouncedDirectory)
        },
        enabled: Boolean(api && enabled && machineId && debouncedDirectory),
    })

    return {
        agents: query.data?.agents ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load agents' : null,
    }
}
