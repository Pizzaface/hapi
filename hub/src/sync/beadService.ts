import { BeadSummarySchema } from '@hapi/protocol/beads'
import type { BeadSummary, Session, SyncEvent } from '@hapi/protocol/types'
import type { Store } from '../store'
import type { BeadGatewayLike } from './beadGateway'

const DEFAULT_POLL_INTERVAL_MS = 15_000
const DEFAULT_JITTER_MS = 5_000
const DEFAULT_RPC_TIMEOUT_MS = 10_000
const DEFAULT_CIRCUIT_BREAKER_FAILURES = 3
const DEFAULT_CIRCUIT_BREAKER_BACKOFF_MS = 60_000

type PollTargetSession = {
    sessionId: string
    machineId: string
    repoPath: string
    beadIds: string[]
}

type PollRepoGroup = {
    key: string
    machineId: string
    repoPath: string
    sessions: PollTargetSession[]
}

export type BeadServiceDeps = {
    store: Store
    getSession: (sessionId: string) => Session | undefined
    getActiveSessions: () => Session[]
    gateway: BeadGatewayLike
    emitEvent: (event: SyncEvent) => void
    pollIntervalMs?: number
    jitterMs?: number
    rpcTimeoutMs?: number
    now?: () => number
    circuitBreakerFailures?: number
    circuitBreakerBackoffMs?: number
}

export type SessionBeadsResult = {
    beads: BeadSummary[]
    stale: boolean
}

export class BeadService {
    private readonly pollIntervalMs: number
    private readonly jitterMs: number
    private readonly rpcTimeoutMs: number
    private readonly now: () => number
    private readonly circuitBreakerFailures: number
    private readonly circuitBreakerBackoffMs: number
    private pollTimer: NodeJS.Timeout | null = null
    private readonly jitterTimers: Set<NodeJS.Timeout> = new Set()
    private readonly inFlightByRepoKey: Map<string, Promise<void>> = new Map()
    private readonly failureCountByRepoKey: Map<string, number> = new Map()
    private readonly backoffUntilByRepoKey: Map<string, number> = new Map()
    private readonly staleBySessionId: Map<string, boolean> = new Map()
    private readonly versionBySessionId: Map<string, number> = new Map()

    constructor(private readonly deps: BeadServiceDeps) {
        this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
        this.jitterMs = deps.jitterMs ?? DEFAULT_JITTER_MS
        this.rpcTimeoutMs = deps.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS
        this.now = deps.now ?? (() => Date.now())
        this.circuitBreakerFailures = deps.circuitBreakerFailures ?? DEFAULT_CIRCUIT_BREAKER_FAILURES
        this.circuitBreakerBackoffMs = deps.circuitBreakerBackoffMs ?? DEFAULT_CIRCUIT_BREAKER_BACKOFF_MS

        if (this.pollIntervalMs > 0) {
            this.pollTimer = setInterval(() => {
                void this.pollActiveSessions()
            }, this.pollIntervalMs)
        }
    }

    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = null
        }

        for (const timer of this.jitterTimers) {
            clearTimeout(timer)
        }
        this.jitterTimers.clear()
    }

    linkBead(sessionId: string, beadId: string, linkedBy?: string | null): boolean {
        const inserted = this.deps.store.sessionBeads.linkBead(sessionId, beadId, linkedBy)
        if (!inserted) {
            return false
        }

        const session = this.deps.getSession(sessionId)
        if (session?.active) {
            void this.pollSessions([session])
        }

        return true
    }

    unlinkBead(sessionId: string, beadId: string): boolean {
        return this.deps.store.sessionBeads.unlinkBead(sessionId, beadId)
    }

    async getSessionBeads(sessionId: string): Promise<SessionBeadsResult> {
        const beadIds = this.deps.store.sessionBeads.getBeadIds(sessionId)
        if (beadIds.length === 0) {
            return { beads: [], stale: false }
        }

        const session = this.deps.getSession(sessionId)
        if (session?.active) {
            await this.pollSessions([session])
        }

        return {
            beads: this.getSnapshotBeads(sessionId, beadIds),
            stale: this.staleBySessionId.get(sessionId) ?? false
        }
    }

    async pollActiveSessions(): Promise<void> {
        const sessions = this.deps.getActiveSessions()
        await this.pollSessions(sessions)
    }

    private async pollSessions(sessions: Session[]): Promise<void> {
        const targets = sessions
            .map((session) => this.toPollTarget(session))
            .filter((target): target is PollTargetSession => target !== null)

        const repoGroups = this.groupByRepo(targets)
        const operations = repoGroups.map((group) => this.scheduleRepoPoll(group))
        await Promise.all(operations)
    }

    private toPollTarget(session: Session): PollTargetSession | null {
        if (!session.active) {
            return null
        }

        const metadata = session.metadata
        if (!metadata) {
            return null
        }

        const machineId = typeof metadata.machineId === 'string' ? metadata.machineId.trim() : ''
        const repoPath = typeof metadata.path === 'string' ? metadata.path.trim() : ''
        if (!machineId || !repoPath) {
            return null
        }

        const beadIds = this.deps.store.sessionBeads.getBeadIds(session.id)
        if (beadIds.length === 0) {
            return null
        }

        return {
            sessionId: session.id,
            machineId,
            repoPath,
            beadIds
        }
    }

    private groupByRepo(targets: PollTargetSession[]): PollRepoGroup[] {
        const byKey = new Map<string, PollRepoGroup>()

        for (const target of targets) {
            const key = `${target.machineId}\u0001${target.repoPath}`
            const existing = byKey.get(key)
            if (existing) {
                existing.sessions.push(target)
                continue
            }

            byKey.set(key, {
                key,
                machineId: target.machineId,
                repoPath: target.repoPath,
                sessions: [target]
            })
        }

        return Array.from(byKey.values())
    }

    private async scheduleRepoPoll(group: PollRepoGroup): Promise<void> {
        if (this.jitterMs <= 0) {
            await this.pollRepoGroup(group)
            return
        }

        const delay = Math.floor(Math.random() * (this.jitterMs + 1))

        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                this.jitterTimers.delete(timer)
                void this.pollRepoGroup(group).finally(resolve)
            }, delay)
            this.jitterTimers.add(timer)
        })
    }

    private async pollRepoGroup(group: PollRepoGroup): Promise<void> {
        const backoffUntil = this.backoffUntilByRepoKey.get(group.key) ?? 0
        if (this.now() < backoffUntil) {
            return
        }

        const inFlight = this.inFlightByRepoKey.get(group.key)
        if (inFlight) {
            await inFlight
            return
        }

        const pollPromise = this.pollRepoGroupInternal(group)
            .finally(() => {
                this.inFlightByRepoKey.delete(group.key)
            })

        this.inFlightByRepoKey.set(group.key, pollPromise)
        await pollPromise
    }

    private async pollRepoGroupInternal(group: PollRepoGroup): Promise<void> {
        const representative = group.sessions[0]
        if (!representative) {
            return
        }

        const allBeadIds = Array.from(new Set(group.sessions.flatMap((session) => session.beadIds)))

        let beads: BeadSummary[]
        try {
            beads = await this.deps.gateway.showFromSession(
                representative.sessionId,
                allBeadIds,
                this.rpcTimeoutMs
            )
        } catch {
            try {
                beads = await this.deps.gateway.showFromMachine(
                    group.machineId,
                    group.repoPath,
                    allBeadIds,
                    this.rpcTimeoutMs
                )
            } catch {
                this.markRepoFailure(group)
                return
            }
        }

        this.markRepoSuccess(group)

        const fetchedAt = this.now()
        const beadById = new Map(beads.map((bead) => [bead.id, bead]))

        for (const session of group.sessions) {
            let changed = false
            for (const beadId of session.beadIds) {
                const bead = beadById.get(beadId)
                if (!bead) {
                    continue
                }

                const parsed = BeadSummarySchema.safeParse(bead)
                if (!parsed.success) {
                    continue
                }

                if (this.deps.store.sessionBeads.saveSnapshot(session.sessionId, beadId, parsed.data, fetchedAt)) {
                    changed = true
                }
            }

            this.staleBySessionId.set(session.sessionId, false)

            if (changed) {
                this.emitBeadsUpdated(session.sessionId)
            }
        }
    }

    private markRepoFailure(group: PollRepoGroup): void {
        const currentFailures = this.failureCountByRepoKey.get(group.key) ?? 0
        const nextFailures = currentFailures + 1
        this.failureCountByRepoKey.set(group.key, nextFailures)

        if (nextFailures >= this.circuitBreakerFailures) {
            this.backoffUntilByRepoKey.set(group.key, this.now() + this.circuitBreakerBackoffMs)
        }

        for (const session of group.sessions) {
            this.staleBySessionId.set(session.sessionId, true)
        }
    }

    private markRepoSuccess(group: PollRepoGroup): void {
        this.failureCountByRepoKey.set(group.key, 0)
        this.backoffUntilByRepoKey.delete(group.key)
    }

    private getSnapshotBeads(sessionId: string, beadIds: string[]): BeadSummary[] {
        const snapshots = this.deps.store.sessionBeads.getSnapshots(sessionId)
        const byId = new Map<string, BeadSummary>()

        for (const snapshot of snapshots) {
            const parsed = BeadSummarySchema.safeParse(snapshot.data)
            if (!parsed.success) {
                continue
            }
            byId.set(snapshot.beadId, parsed.data)
        }

        const beads: BeadSummary[] = []
        for (const beadId of beadIds) {
            const bead = byId.get(beadId)
            if (bead) {
                beads.push(bead)
            }
        }

        return beads
    }

    private emitBeadsUpdated(sessionId: string): void {
        const nextVersion = (this.versionBySessionId.get(sessionId) ?? 0) + 1
        this.versionBySessionId.set(sessionId, nextVersion)
        this.deps.emitEvent({
            type: 'beads-updated',
            sessionId,
            version: nextVersion
        })
    }
}
