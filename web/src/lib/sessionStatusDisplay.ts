import type { SessionStatusKey } from '@hapi/protocol'

export type SessionStatusDisplay = {
    dotClass: string
    labelClass: string
    animate: boolean
    i18nKey: string | null
}

export const SESSION_STATUS_DISPLAY: Record<SessionStatusKey, SessionStatusDisplay> = {
    'waiting-for-permission': {
        dotClass: 'bg-[var(--app-badge-warning-text)]',
        labelClass: 'text-[var(--app-badge-warning-text)]',
        animate: true,
        i18nKey: 'session.status.needsInput',
    },
    'thinking': {
        dotClass: 'bg-[#007AFF]',
        labelClass: 'text-[#007AFF]',
        animate: true,
        i18nKey: 'session.status.thinking',
    },
    'idle': {
        dotClass: 'bg-[var(--app-badge-success-text)]',
        labelClass: 'text-[var(--app-badge-success-text)]',
        animate: false,
        i18nKey: 'session.status.idle',
    },
    'offline': {
        dotClass: 'bg-[var(--app-hint)]',
        labelClass: 'text-[var(--app-hint)]',
        animate: false,
        i18nKey: null,
    },
}

const FALLBACK_DISPLAY: SessionStatusDisplay = {
    dotClass: 'bg-[var(--app-hint)]',
    labelClass: 'text-[var(--app-hint)]',
    animate: false,
    i18nKey: null,
}

export function getSessionStatusDisplay(status: string): SessionStatusDisplay {
    return SESSION_STATUS_DISPLAY[status as SessionStatusKey] ?? FALLBACK_DISPLAY
}
