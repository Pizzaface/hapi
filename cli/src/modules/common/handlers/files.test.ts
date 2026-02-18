import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'
import { registerFileHandlers } from './files'

async function createTempDir(prefix: string): Promise<string> {
    const base = tmpdir()
    const path = join(base, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(path, { recursive: true })
    return path
}

describe('file RPC handlers', () => {
    let sandboxDir: string
    let rpc: RpcHandlerManager
    const testFileName = 'test_file.txt'

    beforeEach(async () => {
        sandboxDir = await createTempDir('files-test')
        rpc = new RpcHandlerManager({ scopePrefix: 'test' })
        registerFileHandlers(rpc, sandboxDir)
    })

    afterEach(async () => {
        // Clean up sandbox
        await rm(sandboxDir, { recursive: true, force: true })
        // Clean up potential file in CWD
        await rm(join(process.cwd(), testFileName), { force: true })
    })

    it('writes file to sandbox directory using relative path', async () => {
        const content = 'test content'
        const contentBase64 = Buffer.from(content).toString('base64')

        const response = await rpc.handleRequest({
            method: 'test:writeFile',
            params: JSON.stringify({
                path: testFileName,
                content: contentBase64
            })
        })
        const parsed = JSON.parse(response)
        expect(parsed.success).toBe(true)

        // Check if file exists in sandbox (it should)
        const sandboxFilePath = join(sandboxDir, testFileName)
        let inSandbox = false
        try {
            const fileContent = await readFile(sandboxFilePath, 'utf-8')
            expect(fileContent).toBe(content)
            inSandbox = true
        } catch {}

        // Check if file exists in CWD (it should NOT)
        const cwdFilePath = join(process.cwd(), testFileName)
        let inCwd = false
        try {
            await readFile(cwdFilePath)
            inCwd = true
        } catch {}

        expect(inSandbox).toBe(true)
        expect(inCwd).toBe(false)
    })
})
