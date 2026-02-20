import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { SyncEngine } from './syncEngine'

type RpcHandler = (params: unknown) => unknown | Promise<unknown>

type RpcPayload = {
    method: string
    params: string
}

class FakeRpcSocket {
    readonly id: string
    private readonly handlers: Map<string, RpcHandler>

    constructor(id: string, handlers: Map<string, RpcHandler>) {
        this.id = id
        this.handlers = handlers
    }

    timeout(_ms: number): { emitWithAck: (_event: string, payload: RpcPayload) => Promise<unknown> } {
        return {
            emitWithAck: async (_event: string, payload: RpcPayload): Promise<unknown> => {
                const handler = this.handlers.get(payload.method)
                if (!handler) {
                    throw new Error(`RPC handler not registered: ${payload.method}`)
                }
                const parsedParams = JSON.parse(payload.params) as unknown
                return await handler(parsedParams)
            }
        }
    }
}

class FakeCliNamespace {
    readonly sockets: Map<string, FakeRpcSocket> = new Map()
    readonly broadcasts: Array<{ room: string; event: string; payload: unknown }> = []

    to(room: string): { emit: (event: string, payload: unknown) => void } {
        return {
            emit: (event: string, payload: unknown): void => {
                this.broadcasts.push({ room, event, payload })
            }
        }
    }
}

class FakeIo {
    readonly cliNamespace = new FakeCliNamespace()

    of(namespace: string): FakeCliNamespace {
        if (namespace !== '/cli') {
            throw new Error(`Unexpected namespace: ${namespace}`)
        }
        return this.cliNamespace
    }
}

class FakeRpcRegistry {
    private readonly methodToSocketId: Map<string, string> = new Map()

    register(method: string, socketId: string): void {
        this.methodToSocketId.set(method, socketId)
    }

    getSocketIdForMethod(method: string): string | null {
        return this.methodToSocketId.get(method) ?? null
    }
}

function createHarness(): {
    engine: SyncEngine
    store: Store
    registerRpc: (method: string, handler: RpcHandler) => void
    stop: () => void
} {
    const store = new Store(':memory:')

    const rpcHandlers = new Map<string, RpcHandler>()
    const io = new FakeIo()
    const rpcRegistry = new FakeRpcRegistry()
    const rpcSocket = new FakeRpcSocket('rpc-socket', rpcHandlers)
    io.cliNamespace.sockets.set(rpcSocket.id, rpcSocket)

    const sseStub = {
        broadcast: (_event: unknown): void => {
        }
    }

    const engine = new SyncEngine(store, io as never, rpcRegistry as never, sseStub as never)

    return {
        engine,
        store,
        registerRpc: (method: string, handler: RpcHandler): void => {
            rpcHandlers.set(method, handler)
            rpcRegistry.register(method, rpcSocket.id)
        },
        stop: (): void => {
            engine.stop()
        }
    }
}

describe('SyncEngine.spawnSession initialPrompt', () => {
    it('sends initialPrompt when the spawned session is active', async () => {
        const ctx = createHarness()

        try {
            const spawnedSession = ctx.engine.getOrCreateSession(
                'spawn-target',
                { path: '/tmp/repo', host: 'host-a', machineId: 'machine-1' },
                null,
                'alpha'
            )
            ctx.engine.handleSessionAlive({ sid: spawnedSession.id, time: Date.now() })

            ctx.registerRpc('machine-1:spawn-happy-session', (params: unknown) => {
                expect(params).toMatchObject({
                    type: 'spawn-in-directory',
                    directory: '/tmp/repo',
                    agent: 'codex'
                })
                expect((params as { initialPrompt?: string }).initialPrompt).toBeUndefined()
                return { type: 'success', sessionId: spawnedSession.id }
            })

            const result = await ctx.engine.spawnSession(
                'machine-1',
                '/tmp/repo',
                'codex',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                'Solve this task'
            )

            expect(result).toEqual({
                type: 'success',
                sessionId: spawnedSession.id,
                initialPromptDelivery: 'delivered'
            })

            const messages = ctx.store.messages.getMessages(spawnedSession.id, 10)
            expect(messages).toHaveLength(1)
            expect(messages[0]?.content).toMatchObject({
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Solve this task'
                },
                meta: {
                    sentFrom: 'spawn'
                }
            })
        } finally {
            ctx.stop()
        }
    })

    it('does not wait or send message when initialPrompt is omitted', async () => {
        const ctx = createHarness()

        try {
            let waitCalls = 0
            ;(ctx.engine as unknown as { waitForSessionActive: () => Promise<boolean> }).waitForSessionActive = async () => {
                waitCalls += 1
                return true
            }

            ctx.registerRpc('machine-1:spawn-happy-session', () => ({
                type: 'success',
                sessionId: 'spawned-session'
            }))

            const result = await ctx.engine.spawnSession('machine-1', '/tmp/repo')

            expect(result).toEqual({
                type: 'success',
                sessionId: 'spawned-session'
            })
            expect(waitCalls).toBe(0)
            expect(ctx.store.messages.getMessages('spawned-session', 10)).toHaveLength(0)
        } finally {
            ctx.stop()
        }
    })

    it('returns success with timed_out status when prompt delivery wait times out', async () => {
        const ctx = createHarness()

        try {
            ;(ctx.engine as unknown as { waitForSessionActive: () => Promise<boolean> }).waitForSessionActive = async () => false

            ctx.registerRpc('machine-1:spawn-happy-session', () => ({
                type: 'success',
                sessionId: 'spawned-timeout'
            }))

            const result = await ctx.engine.spawnSession(
                'machine-1',
                '/tmp/repo',
                'claude',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                'Plan this refactor'
            )

            expect(result).toEqual({
                type: 'success',
                sessionId: 'spawned-timeout',
                initialPromptDelivery: 'timed_out'
            })
            expect(ctx.store.messages.getMessages('spawned-timeout', 10)).toHaveLength(0)
        } finally {
            ctx.stop()
        }
    })

    it('treats empty initialPrompt as omitted', async () => {
        const ctx = createHarness()

        try {
            let waitCalls = 0
            ;(ctx.engine as unknown as { waitForSessionActive: () => Promise<boolean> }).waitForSessionActive = async () => {
                waitCalls += 1
                return true
            }

            ctx.registerRpc('machine-1:spawn-happy-session', () => ({
                type: 'success',
                sessionId: 'spawned-empty'
            }))

            const result = await ctx.engine.spawnSession(
                'machine-1',
                '/tmp/repo',
                'claude',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                '   '
            )

            expect(result).toEqual({
                type: 'success',
                sessionId: 'spawned-empty'
            })
            expect(waitCalls).toBe(0)
            expect(ctx.store.messages.getMessages('spawned-empty', 10)).toHaveLength(0)
        } finally {
            ctx.stop()
        }
    })
})
