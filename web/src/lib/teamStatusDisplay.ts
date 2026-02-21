import type { TeamAggregateStatusKey } from '@hapi/protocol'

export type TeamAggregateStatusDisplay = {
    dotClass: string
    labelClass: string
    animate: boolean
    i18nKey: string | null
}

export const TEAM_AGGREGATE_STATUS_DISPLAY: Record<TeamAggregateStatusKey, TeamAggregateStatusDisplay> = {
    'needs-input': {
        dotClass: 'bg-[var(--app-badge-warning-text)]',
        labelClass: 'text-[var(--app-badge-warning-text)]',
        animate: true,
        i18nKey: 'team.status.needsInput',
    },
    'error': {
        dotClass: 'bg-red-500',
        labelClass: 'text-red-500',
        animate: false,
        i18nKey: 'team.status.error',
    },
    'thinking': {
        dotClass: 'bg-[#007AFF]',
        labelClass: 'text-[#007AFF]',
        animate: true,
        i18nKey: 'team.status.thinking',
    },
    'working': {
        dotClass: 'bg-[var(--app-badge-success-text)]',
        labelClass: 'text-[var(--app-badge-success-text)]',
        animate: false,
        i18nKey: 'team.status.working',
    },
    'offline': {
        dotClass: 'bg-[var(--app-hint)]',
        labelClass: 'text-[var(--app-hint)]',
        animate: false,
        i18nKey: null,
    },
}

const FALLBACK_DISPLAY: TeamAggregateStatusDisplay = {
    dotClass: 'bg-[var(--app-hint)]',
    labelClass: 'text-[var(--app-hint)]',
    animate: false,
    i18nKey: null,
}

export function getTeamAggregateStatusDisplay(status: string): TeamAggregateStatusDisplay {
    return TEAM_AGGREGATE_STATUS_DISPLAY[status as TeamAggregateStatusKey] ?? FALLBACK_DISPLAY
}
