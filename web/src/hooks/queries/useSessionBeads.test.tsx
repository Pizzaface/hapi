import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSessionBeads } from './useSessionBeads'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false }
        }
    })
}

function createWrapper(client: QueryClient) {
    return function Wrapper(props: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
    }
}

describe('useSessionBeads', () => {
    it('fetches beads on mount', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSessionBeads: vi.fn().mockResolvedValue({
                beads: [{
                    id: 'hapi-6uf',
                    title: 'Beads UI',
                    status: 'open',
                    priority: 2
                }],
                stale: false
            })
        }

        const { result } = renderHook(
            () => useSessionBeads(api as never, 'session-1'),
            { wrapper: createWrapper(queryClient) }
        )

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(api.getSessionBeads).toHaveBeenCalledTimes(1)
        expect(api.getSessionBeads).toHaveBeenCalledWith('session-1')
        expect(result.current.beads).toHaveLength(1)
        expect(result.current.stale).toBe(false)
    })
})
