import type { AgentFlavor } from '@hapi/protocol/modes'

export type ProviderKey = AgentFlavor | 'unknown'

export type ProviderDisplay = {
    key: ProviderKey
    label: string
    colorVar: string
}

const PROVIDER_DISPLAY: Record<ProviderKey, ProviderDisplay> = {
    claude: {
        key: 'claude',
        label: 'Claude',
        colorVar: '--app-provider-claude'
    },
    codex: {
        key: 'codex',
        label: 'Codex',
        colorVar: '--app-provider-codex'
    },
    gemini: {
        key: 'gemini',
        label: 'Gemini',
        colorVar: '--app-provider-gemini'
    },
    opencode: {
        key: 'opencode',
        label: 'OpenCode',
        colorVar: '--app-provider-opencode'
    },
    unknown: {
        key: 'unknown',
        label: 'Unknown',
        colorVar: '--app-provider-unknown'
    }
}

function normalizeProviderKey(flavor?: string | null): ProviderKey {
    const normalized = flavor?.trim().toLowerCase()
    if (normalized === 'claude' || normalized === 'codex' || normalized === 'gemini' || normalized === 'opencode') {
        return normalized
    }

    return 'unknown'
}

export function resolveProvider(flavor?: string | null): ProviderDisplay {
    return PROVIDER_DISPLAY[normalizeProviderKey(flavor)]
}
