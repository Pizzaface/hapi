import { describe, expect, it } from 'bun:test'
import type { BeadSummary, Session, SyncEvent } from '@hapi/protocol/types'
import { Store } from '../store'
import { BeadService } from './beadService'

type GatewayStub = {
    showFromSessionCalls: Array<{ sessionId: string; beadIds: string[]; timeoutMs: number }>
    showFromMachineCalls: Array<{ machineId: string; repoPath: string; beadIds: string[]; timeoutMs: number }>
    showFromSession: (sessionId: string, beadIds: string[], timeoutMs: number) => Promise<BeadSummary[]>
    showFromMachine: (machineId: string, repoPath: string, beadIds: string[], timeoutMs: number) => Promise<BeadSummary[]>
}

function makeSession(id: string, options: {
    active?: boolean
    machineId?: string
    path?: string
} = {}): Session {
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: options.active ?? true,
        activeAt: 1,
        metadata: {
            path: options.path ?? '/repo',
            host: 'host',
            machineId: options.machineId ?? 'machine-1'
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        sortOrder: 'a0',
        thinking: false,
        thinkingAt: 0
    }
}

function createHarness(config: {
    sessions: Session[]
    gateway?: Partial<GatewayStub>
    now?: () => number
    pollIntervalMs?: number
    jitterMs?: number
}) {
    const store = new Store(':memory:')
    const sessionById = new Map(config.sessions.map((session) => [session.id, session]))
    const events: SyncEvent[] = []

    const defaultGateway: GatewayStub = {
        showFromSessionCalls: [],
        showFromMachineCalls: [],
        showFromSession: async (_sessionId, _beadIds) => [],
        showFromMachine: async (_machineId, _repoPath, _beadIds) => []
    }

    const gateway: GatewayStub = {
        ...defaultGateway,
        ...config.gateway,
        showFromSessionCalls: [],
        showFromMachineCalls: []
    }

    const service = new BeadService({
        store,
        getSession: (sessionId) => sessionById.get(sessionId),
        getActiveSessions: () => config.sessions.filter((session) => session.active),
        gateway: {
            showFromSession: async (sessionId, beadIds, timeoutMs) => {
                gateway.showFromSessionCalls.push({ sessionId, beadIds, timeoutMs })
                return await gateway.showFromSession(sessionId, beadIds, timeoutMs)
            },
            showFromMachine: async (machineId, repoPath, beadIds, timeoutMs) => {
                gateway.showFromMachineCalls.push({ machineId, repoPath, beadIds, timeoutMs })
                return await gateway.showFromMachine(machineId, repoPath, beadIds, timeoutMs)
            }
        },
        emitEvent: (event) => events.push(event),
        pollIntervalMs: config.pollIntervalMs ?? 15_000,
        jitterMs: config.jitterMs ?? 0,
        now: config.now
    })

    return { store, service, events, gateway }
}

describe('BeadService', () => {
    it('polls only active sessions with linked beads', async () => {
        const sessions = [
            makeSession('active-linked', { active: true }),
            makeSession('inactive-linked', { active: false }),
            makeSession('active-unlinked', { active: true })
        ]
        const harness = createHarness({ sessions })
        harness.store.sessionBeads.linkBead('active-linked', 'hapi-1')
        harness.store.sessionBeads.linkBead('inactive-linked', 'hapi-2')

        await harness.service.pollActiveSessions()

        expect(harness.gateway.showFromSessionCalls).toHaveLength(1)
        expect(harness.gateway.showFromSessionCalls[0]).toMatchObject({
            sessionId: 'active-linked',
            beadIds: ['hapi-1']
        })
    })

    it('deduplicates polls by machineId and repoPath', async () => {
        const sessions = [
            makeSession('s1', { machineId: 'machine-1', path: '/repo' }),
            makeSession('s2', { machineId: 'machine-1', path: '/repo' })
        ]
        const harness = createHarness({ sessions })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')
        harness.store.sessionBeads.linkBead('s2', 'hapi-2')

        await harness.service.pollActiveSessions()

        expect(harness.gateway.showFromSessionCalls).toHaveLength(1)
        expect(harness.gateway.showFromSessionCalls[0]?.beadIds.sort()).toEqual(['hapi-1', 'hapi-2'])
    })

    it('emits beads-updated when snapshots change', async () => {
        const sessions = [makeSession('s1')]
        const harness = createHarness({
            sessions,
            gateway: {
                showFromSession: async () => [{
                    id: 'hapi-1',
                    title: 'Feature',
                    status: 'open',
                    priority: 2
                }]
            }
        })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')

        await harness.service.pollActiveSessions()

        const updateEvent = harness.events.find((event) => event.type === 'beads-updated')
        expect(updateEvent).toBeDefined()
        if (!updateEvent || updateEvent.type !== 'beads-updated') {
            throw new Error('Expected beads-updated event')
        }
        expect(updateEvent.sessionId).toBe('s1')
        expect(updateEvent.version).toBe(1)
    })

    it('does not emit beads-updated when snapshots are unchanged', async () => {
        const sessions = [makeSession('s1')]
        const bead = {
            id: 'hapi-1',
            title: 'Feature',
            status: 'open',
            priority: 2
        }
        const harness = createHarness({
            sessions,
            gateway: {
                showFromSession: async () => [bead]
            }
        })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')

        await harness.service.pollActiveSessions()
        await harness.service.pollActiveSessions()

        const updateEvents = harness.events.filter((event) => event.type === 'beads-updated')
        expect(updateEvents).toHaveLength(1)
    })

    it('returns stale snapshots when refresh times out', async () => {
        const sessions = [makeSession('s1')]
        const harness = createHarness({
            sessions,
            gateway: {
                showFromSession: async () => [{
                    id: 'hapi-1',
                    title: 'Feature',
                    status: 'open',
                    priority: 2
                }]
            }
        })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')
        await harness.service.pollActiveSessions()

        harness.gateway.showFromSession = async () => {
            throw new Error('RPC timeout')
        }
        harness.gateway.showFromMachine = async () => {
            throw new Error('RPC timeout')
        }

        const result = await harness.service.getSessionBeads('s1')

        expect(result.stale).toBe(true)
        expect(result.beads).toHaveLength(1)
        expect(result.beads[0]?.id).toBe('hapi-1')
    })

    it('uses circuit breaker backoff after 3 failures', async () => {
        let now = 0
        const sessions = [makeSession('s1')]
        const harness = createHarness({
            sessions,
            now: () => now,
            gateway: {
                showFromSession: async () => {
                    throw new Error('RPC failure')
                },
                showFromMachine: async () => {
                    throw new Error('RPC failure')
                }
            }
        })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')

        await harness.service.pollActiveSessions()
        await harness.service.pollActiveSessions()
        await harness.service.pollActiveSessions()

        expect(harness.gateway.showFromSessionCalls).toHaveLength(3)

        now += 1_000
        await harness.service.pollActiveSessions()
        expect(harness.gateway.showFromSessionCalls).toHaveLength(3)

        now += 60_000
        await harness.service.pollActiveSessions()
        expect(harness.gateway.showFromSessionCalls).toHaveLength(4)
    })

    it('prevents overlapping polls with in-flight guard', async () => {
        const sessions = [makeSession('s1')]
        let releasePoll: (() => void) | undefined
        const harness = createHarness({
            sessions,
            gateway: {
                showFromSession: async () => {
                    await new Promise<void>((resolve) => {
                        releasePoll = () => resolve()
                    })
                    return [{
                        id: 'hapi-1',
                        title: 'Feature',
                        status: 'open',
                        priority: 2
                    }]
                }
            }
        })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')

        const first = harness.service.pollActiveSessions()
        const second = harness.service.pollActiveSessions()

        expect(harness.gateway.showFromSessionCalls).toHaveLength(1)

        if (!releasePoll) {
            throw new Error('Expected in-flight poll handle')
        }
        releasePoll()
        await Promise.all([first, second])
    })

    it('falls back to machine-level RPC when session RPC fails', async () => {
        const sessions = [makeSession('s1', { machineId: 'machine-x', path: '/repo-x' })]
        const harness = createHarness({
            sessions,
            gateway: {
                showFromSession: async () => {
                    throw new Error('session socket offline')
                },
                showFromMachine: async () => [{
                    id: 'hapi-1',
                    title: 'Feature',
                    status: 'in_progress',
                    priority: 1
                }]
            }
        })
        harness.store.sessionBeads.linkBead('s1', 'hapi-1')

        await harness.service.pollActiveSessions()

        expect(harness.gateway.showFromSessionCalls).toHaveLength(1)
        expect(harness.gateway.showFromMachineCalls).toHaveLength(1)
        expect(harness.gateway.showFromMachineCalls[0]).toMatchObject({
            machineId: 'machine-x',
            repoPath: '/repo-x',
            beadIds: ['hapi-1']
        })
    })
})
