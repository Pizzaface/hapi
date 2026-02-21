/**
 * Semantic session status derivation — no UI concerns.
 *
 * Priority: waiting-for-permission > thinking > idle > offline
 */

export type SessionStatusKey =
    | 'waiting-for-permission'
    | 'thinking'
    | 'idle'
    | 'offline'

export type SessionStatusInput = {
    active: boolean
    thinking: boolean
    pendingRequestsCount: number
}

/** Lower number = higher priority. */
export const SESSION_STATUS_PRIORITY: Record<SessionStatusKey, number> = {
    'waiting-for-permission': 0,
    'thinking': 1,
    'idle': 2,
    'offline': 3,
}

export function deriveSessionStatus(session: SessionStatusInput): SessionStatusKey {
    if (!session.active) return 'offline'
    if (session.pendingRequestsCount > 0) return 'waiting-for-permission'
    if (session.thinking) return 'thinking'
    return 'idle'
}

/**
 * Aggregate status for a team of sessions.
 * Priority: needs-input > error > thinking > working > offline
 *
 * Maps SessionSummary fields directly — does NOT reuse deriveSessionStatus.
 */
export type TeamAggregateStatusKey =
    | 'needs-input'
    | 'error'
    | 'thinking'
    | 'working'
    | 'offline'

export const TEAM_AGGREGATE_STATUS_PRIORITY: Record<TeamAggregateStatusKey, number> = {
    'needs-input': 0,
    'error': 1,
    'thinking': 2,
    'working': 3,
    'offline': 4,
}

export type TeamAggregateStatusInput = {
    active: boolean
    thinking: boolean
    pendingRequestsCount: number
    errorMessage?: string | null
}

export function deriveTeamAggregateStatus(
    sessions: TeamAggregateStatusInput[]
): TeamAggregateStatusKey {
    let best: TeamAggregateStatusKey = 'offline'
    let bestPriority = TEAM_AGGREGATE_STATUS_PRIORITY['offline']

    for (const session of sessions) {
        let status: TeamAggregateStatusKey

        if (session.pendingRequestsCount > 0) {
            status = 'needs-input'
        } else if (session.errorMessage) {
            status = 'error'
        } else if (session.active && session.thinking) {
            status = 'thinking'
        } else if (session.active && !session.thinking) {
            status = 'working'
        } else {
            status = 'offline'
        }

        const priority = TEAM_AGGREGATE_STATUS_PRIORITY[status]
        if (priority < bestPriority) {
            best = status
            bestPriority = priority
        }
    }

    return best
}
