import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import * as fsPromises from 'node:fs/promises'

mock.module('node:fs/promises', () => ({
    rename: mock(),
    mkdir: mock(),
    chmod: mock(),
}))

// Import after mocks
import { getOrCreateCliApiToken } from './cliApiToken'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('cliApiToken', () => {
    const dataDir = join(tmpdir(), 'hapi-test-' + Math.random().toString(36).slice(2))

    let fileMock: any;
    let writeMock: any;

    beforeEach(() => {
        process.env.CLI_API_TOKEN = ''
        fileMock = spyOn(Bun, 'file');
        writeMock = spyOn(Bun, 'write');
    })

    afterEach(() => {
        delete process.env.CLI_API_TOKEN
        fileMock.mockRestore();
        writeMock.mockRestore();
    })

    it('should throw Error if CLI_API_TOKEN from env is weak', async () => {
        process.env.CLI_API_TOKEN = 'weak'

        fileMock.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve('{}')
        } as any)

        expect(getOrCreateCliApiToken(dataDir)).rejects.toThrow('CLI_API_TOKEN is too weak')
    })

    it('should throw Error if CLI_API_TOKEN from settings.json is weak', async () => {
        fileMock.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve(JSON.stringify({ cliApiToken: 'weak-in-file' }))
        } as any)

        expect(getOrCreateCliApiToken(dataDir)).rejects.toThrow('Saved CLI API token in settings.json is too weak')
    })

    it('should allow strong CLI_API_TOKEN from env', async () => {
        const strongToken = 'a-very-strong-token-that-is-long-enough'
        process.env.CLI_API_TOKEN = strongToken

        fileMock.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve('{}')
        } as any)

        writeMock.mockResolvedValue(undefined)
        // @ts-ignore
        fsPromises.rename.mockResolvedValue(undefined)

        const result = await getOrCreateCliApiToken(dataDir)
        expect(result.token).toBe(strongToken)
        expect(result.source).toBe('env')
    })

    it('should allow strong CLI_API_TOKEN from settings.json', async () => {
        const strongToken = 'another-strong-token-from-file-system'

        fileMock.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve(JSON.stringify({ cliApiToken: strongToken }))
        } as any)

        const result = await getOrCreateCliApiToken(dataDir)
        expect(result.token).toBe(strongToken)
        expect(result.source).toBe('file')
    })

    it('should auto-generate strong token if none exists', async () => {
        fileMock.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve('{}')
        } as any)

        writeMock.mockResolvedValue(undefined)
        // @ts-ignore
        fsPromises.rename.mockResolvedValue(undefined)

        const result = await getOrCreateCliApiToken(dataDir)
        expect(result.token.length).toBeGreaterThan(32)
        expect(result.source).toBe('generated')
    })
})
