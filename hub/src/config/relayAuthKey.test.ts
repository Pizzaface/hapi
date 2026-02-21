import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'

mock.module('node:fs', () => ({
    existsSync: mock(),
    mkdirSync: mock(),
}))

mock.module('node:fs/promises', () => ({
    readFile: mock(),
    writeFile: mock(),
    rename: mock(),
    mkdir: mock(),
    chmod: mock(),
}))

// Import after mocks
import { getOrCreateRelayAuthKey } from './relayAuthKey'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('relayAuthKey', () => {
    const dataDir = join(tmpdir(), 'hapi-test-' + Math.random().toString(36).slice(2))
    const settingsFile = join(dataDir, 'settings.json')
    const tmpFile = settingsFile + '.tmp'

    beforeEach(() => {
        delete process.env.HAPI_RELAY_AUTH
    })

    afterEach(() => {
        delete process.env.HAPI_RELAY_AUTH
    })

    it('should use HAPI_RELAY_AUTH env var when set', async () => {
        process.env.HAPI_RELAY_AUTH = 'my-custom-auth-key'

        const result = await getOrCreateRelayAuthKey(dataDir)
        expect(result.key).toBe('my-custom-auth-key')
        expect(result.source).toBe('env')
    })

    it('should use existing relayAuthKey from settings.json', async () => {
        const existingKey = 'previously-generated-key-value'
        // @ts-ignore
        fsPromises.readFile.mockResolvedValue(JSON.stringify({ relayAuthKey: existingKey }))
        // @ts-ignore
        fs.existsSync.mockReturnValue(true)

        const result = await getOrCreateRelayAuthKey(dataDir)
        expect(result.key).toBe(existingKey)
        expect(result.source).toBe('file')
    })

    it('should auto-generate and persist key when none exists', async () => {
        // @ts-ignore
        fsPromises.readFile.mockResolvedValue('{}')
        // @ts-ignore
        fs.existsSync.mockReturnValue(true)
        // @ts-ignore
        fsPromises.writeFile.mockResolvedValue(undefined)
        // @ts-ignore
        fsPromises.rename.mockResolvedValue(undefined)
        // @ts-ignore
        fsPromises.chmod.mockResolvedValue(undefined)

        const result = await getOrCreateRelayAuthKey(dataDir)
        // 32 bytes base64url = 43 characters
        expect(result.key.length).toBe(43)
        expect(result.source).toBe('generated')
        // Verify it was persisted
        expect(fsPromises.writeFile).toHaveBeenCalledWith(tmpFile, expect.any(String), { mode: 0o600 })
        expect(fsPromises.rename).toHaveBeenCalledWith(tmpFile, settingsFile)

        // Verify the saved JSON contains relayAuthKey
        const savedJson = (fsPromises.writeFile as any).mock.calls[0][1] as string
        const saved = JSON.parse(savedJson)
        expect(saved.relayAuthKey).toBe(result.key)
    })

    it('should return consistent keys on subsequent calls from file', async () => {
        const persistedKey = 'a-key-that-was-saved-earlier-abc'
        // @ts-ignore
        fsPromises.readFile.mockResolvedValue(JSON.stringify({ relayAuthKey: persistedKey }))
        // @ts-ignore
        fs.existsSync.mockReturnValue(true)

        const result1 = await getOrCreateRelayAuthKey(dataDir)
        const result2 = await getOrCreateRelayAuthKey(dataDir)
        expect(result1.key).toBe(persistedKey)
        expect(result2.key).toBe(persistedKey)
    })

    it('env var should take precedence over settings.json', async () => {
        process.env.HAPI_RELAY_AUTH = 'env-override-key'
        // @ts-ignore
        fsPromises.readFile.mockResolvedValue(JSON.stringify({ relayAuthKey: 'file-key' }))
        // @ts-ignore
        fs.existsSync.mockReturnValue(true)

        const result = await getOrCreateRelayAuthKey(dataDir)
        expect(result.key).toBe('env-override-key')
        expect(result.source).toBe('env')
    })
})
