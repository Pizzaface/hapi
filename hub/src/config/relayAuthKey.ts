/**
 * Relay Auth Key management
 *
 * Handles automatic generation and persistence of the relay tunnel auth key.
 * Priority: HAPI_RELAY_AUTH env var > settings.json relayAuthKey > auto-generate
 */

import { randomBytes } from 'node:crypto'
import { getOrCreateSettingsValue } from './generators'
import { getSettingsFile } from './settings'

export interface RelayAuthKeyResult {
    key: string
    source: 'env' | 'file' | 'generated'
}

/**
 * Get or create relay auth key
 *
 * Priority:
 * 1. HAPI_RELAY_AUTH environment variable (highest)
 * 2. settings.json relayAuthKey field
 * 3. Auto-generate and save to settings.json
 */
export async function getOrCreateRelayAuthKey(dataDir: string): Promise<RelayAuthKeyResult> {
    // 1. Environment variable has highest priority
    const envKey = process.env.HAPI_RELAY_AUTH
    if (envKey) {
        return { key: envKey, source: 'env' }
    }

    // 2. Settings file or auto-generate
    const settingsFile = getSettingsFile(dataDir)
    const result = await getOrCreateSettingsValue({
        settingsFile,
        readValue: (settings) => {
            if (!settings.relayAuthKey) return null
            return { value: settings.relayAuthKey }
        },
        writeValue: (settings, value) => {
            settings.relayAuthKey = value
        },
        generate: () => randomBytes(32).toString('base64url'),
    })

    if (result.created) {
        console.log('[Tunnel] Generated new relay auth key')
    }

    return {
        key: result.value,
        source: result.created ? 'generated' : 'file',
    }
}
