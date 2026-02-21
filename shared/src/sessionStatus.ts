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
