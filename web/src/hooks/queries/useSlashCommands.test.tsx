import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSlashCommands } from './useSlashCommands'

function createWrapper(client: QueryClient) {
    return function Wrapper(props: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
    }
}

describe('useSlashCommands builtins', () => {
    it.each(['claude', 'codex', 'gemini', 'opencode'])('includes /exit for %s sessions', (agentType) => {
        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false }
            }
        })

        const { result } = renderHook(
            () => useSlashCommands(null, null, agentType),
            { wrapper: createWrapper(client) }
        )

        expect(result.current.commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'exit',
                    source: 'builtin'
                })
            ])
        )
    })
})
