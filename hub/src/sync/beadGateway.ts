import { BeadSummaryListSchema } from '@hapi/protocol/beads'
import type { BeadSummary } from '@hapi/protocol/types'
import type { RpcGateway } from './rpcGateway'

type RpcBeadsPayload = {
    success?: boolean
    beads?: unknown
    error?: string
}

function parseBeadPayload(payload: unknown): BeadSummary[] {
    const normalized = (() => {
        if (Array.isArray(payload)) {
            return payload
        }

        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid beads RPC response')
        }

        const objectPayload = payload as RpcBeadsPayload
        if (objectPayload.success === false) {
            const error = typeof objectPayload.error === 'string'
                ? objectPayload.error
                : 'Beads RPC failed'
            throw new Error(error)
        }

        if (Array.isArray(objectPayload.beads)) {
            return objectPayload.beads
        }

        throw new Error('Invalid beads RPC response')
    })()

    const parsed = BeadSummaryListSchema.safeParse(normalized)
    if (!parsed.success) {
        throw new Error('Invalid beads payload from RPC')
    }

    return parsed.data
}

export interface BeadGatewayLike {
    showFromSession(sessionId: string, beadIds: string[], timeoutMs: number): Promise<BeadSummary[]>
    showFromMachine(machineId: string, repoPath: string, beadIds: string[], timeoutMs: number): Promise<BeadSummary[]>
}

export class BeadGateway implements BeadGatewayLike {
    constructor(private readonly rpcGateway: RpcGateway) {
    }

    async showFromSession(sessionId: string, beadIds: string[], timeoutMs: number): Promise<BeadSummary[]> {
        const response = await this.rpcGateway.showSessionBeads(sessionId, beadIds, timeoutMs)
        return parseBeadPayload(response)
    }

    async showFromMachine(machineId: string, repoPath: string, beadIds: string[], timeoutMs: number): Promise<BeadSummary[]> {
        const response = await this.rpcGateway.showMachineBeads(machineId, repoPath, beadIds, timeoutMs)
        return parseBeadPayload(response)
    }
}
