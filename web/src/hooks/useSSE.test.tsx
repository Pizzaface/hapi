import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useSSE } from './useSSE'

class FakeEventSource {
    static instances: FakeEventSource[] = []

    onmessage: ((event: MessageEvent<string>) => void) | null = null
    onopen: (() => void) | null = null
    onerror: ((error: unknown) => void) | null = null
    readyState = 1

    constructor(public readonly url: string) {
        FakeEventSource.instances.push(this)
    }

    close() {
        this.readyState = 2
    }

    emit(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>)
    }
}

function createWrapper(client: QueryClient) {
    return function Wrapper(props: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
    }
}

describe('useSSE beads invalidation', () => {
    afterEach(() => {
        FakeEventSource.instances = []
        vi.restoreAllMocks()
    })

    it('invalidates session beads query on beads-updated event', async () => {
        vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)

        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false }
            }
        })
        const invalidateSpy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined as never)

        renderHook(() => useSSE({
            enabled: true,
            token: 'token',
            baseUrl: 'http://localhost:3000',
            subscription: { all: true },
            onEvent: () => {
            }
        }), {
            wrapper: createWrapper(client)
        })

        const source = FakeEventSource.instances[0]
        if (!source) {
            throw new Error('Expected EventSource instance')
        }

        source.emit({ type: 'beads-updated', sessionId: 'session-1', version: 1 })

        await waitFor(() => {
            expect(invalidateSpy).toHaveBeenCalledWith({
                queryKey: queryKeys.sessionBeads('session-1')
            })
        })
    })

    it('invalidates all session bead queries on reconnect event', async () => {
        vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)

        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false }
            }
        })
        const invalidateSpy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined as never)

        renderHook(() => useSSE({
            enabled: true,
            token: 'token',
            baseUrl: 'http://localhost:3000',
            subscription: { all: true },
            onEvent: () => {
            }
        }), {
            wrapper: createWrapper(client)
        })

        const source = FakeEventSource.instances[0]
        if (!source) {
            throw new Error('Expected EventSource instance')
        }

        source.emit({
            type: 'connection-changed',
            data: {
                status: 'connected',
                subscriptionId: 'sub-1'
            }
        })

        await waitFor(() => {
            expect(invalidateSpy).toHaveBeenCalledWith({
                queryKey: queryKeys.sessionBeadsAll
            })
        })
    })

    it('calls onActiveSessionRemoved when the active session is removed', async () => {
        vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)

        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false }
            }
        })
        const onActiveSessionRemoved = vi.fn()

        renderHook(() => useSSE({
            enabled: true,
            token: 'token',
            baseUrl: 'http://localhost:3000',
            subscription: { all: true },
            activeSessionId: 'session-1',
            onActiveSessionRemoved,
            onEvent: () => {
            }
        }), {
            wrapper: createWrapper(client)
        })

        const source = FakeEventSource.instances[0]
        if (!source) {
            throw new Error('Expected EventSource instance')
        }

        source.emit({ type: 'session-removed', sessionId: 'session-2' })
        source.emit({ type: 'session-removed', sessionId: 'session-1' })

        await waitFor(() => {
            expect(onActiveSessionRemoved).toHaveBeenCalledTimes(1)
        })
        expect(onActiveSessionRemoved).toHaveBeenCalledWith('session-1')
    })
})
