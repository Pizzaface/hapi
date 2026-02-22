import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import * as messageWindowStore from '@/lib/message-window-store'
import { useSessionActions } from './useSessionActions'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        }
    })
}

function createWrapper(client: QueryClient) {
    return function Wrapper(props: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
    }
}

describe('useSessionActions exitSession', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('calls onDeleted after successful exit and clears cache', async () => {
        const queryClient = createQueryClient()
        const removeSpy = vi.spyOn(queryClient, 'removeQueries')
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined as never)
        const clearSpy = vi.spyOn(messageWindowStore, 'clearMessageWindow').mockImplementation(() => {})
        const onDeleted = vi.fn()
        const onError = vi.fn()
        const api = {
            exitSession: vi.fn().mockResolvedValue(undefined)
        }

        const { result } = renderHook(
            () => useSessionActions(api as never, 'session-1'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.exitSession({ onDeleted, onError })
        })

        expect(api.exitSession).toHaveBeenCalledWith('session-1')
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.session('session-1')
        })
        expect(clearSpy).toHaveBeenCalledWith('session-1')
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.sessions
        })
        expect(onDeleted).toHaveBeenCalledTimes(1)
        expect(onError).not.toHaveBeenCalled()
    })

    it('calls onError when exit fails and does not call onDeleted', async () => {
        const queryClient = createQueryClient()
        const clearSpy = vi.spyOn(messageWindowStore, 'clearMessageWindow').mockImplementation(() => {})
        const onDeleted = vi.fn()
        const onError = vi.fn()
        const api = {
            exitSession: vi.fn().mockRejectedValue(new Error('Exit failed'))
        }

        const { result } = renderHook(
            () => useSessionActions(api as never, 'session-1'),
            { wrapper: createWrapper(queryClient) }
        )

        let thrown: unknown
        await act(async () => {
            try {
                await result.current.exitSession({ onDeleted, onError })
            } catch (error) {
                thrown = error
            }
        })

        expect(thrown).toBeInstanceOf(Error)
        expect((thrown as Error).message).toContain('Exit failed')
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onDeleted).not.toHaveBeenCalled()
        expect(clearSpy).not.toHaveBeenCalled()
    })
})
