import { execFile, type ExecFileOptions } from 'child_process'
import { promisify } from 'util'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { getErrorMessage, rpcError } from '../rpcResponses'

const execFileAsync = promisify(execFile)

interface BeadsShowRequest {
    beadIds?: string[]
    repoPath?: string
    timeout?: number
}

interface BeadsListRequest {
    repoPath?: string
    timeout?: number
}

type BeadsResponse = {
    success: boolean
    beads?: unknown[]
    error?: string
    stdout?: string
    stderr?: string
    exitCode?: number
}

function resolveRepoPath(repoPath: string | undefined, fallbackPath: string): string {
    const trimmed = repoPath?.trim()
    if (trimmed) {
        return trimmed
    }
    return fallbackPath
}

function parseBeadsStdout(stdout: string): BeadsResponse {
    try {
        const parsed = JSON.parse(stdout) as unknown
        if (Array.isArray(parsed)) {
            return { success: true, beads: parsed }
        }

        if (parsed && typeof parsed === 'object') {
            const record = parsed as Record<string, unknown>
            if (Array.isArray(record.beads)) {
                return { success: true, beads: record.beads }
            }
        }

        return rpcError('Unexpected beads JSON output', { stdout })
    } catch {
        return rpcError('Failed to parse beads JSON output', { stdout })
    }
}

async function runBdJsonCommand(args: string[], cwd: string, timeout?: number): Promise<BeadsResponse> {
    const options: ExecFileOptions = {
        cwd,
        timeout: timeout ?? 10_000
    }

    try {
        const { stdout, stderr } = await execFileAsync('bd', args, options)
        const output = stdout ? stdout.toString() : ''
        const parsed = parseBeadsStdout(output)
        if (!parsed.success) {
            return {
                ...parsed,
                stderr: stderr ? stderr.toString() : ''
            }
        }

        return {
            success: true,
            beads: parsed.beads,
            stderr: stderr ? stderr.toString() : ''
        }
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & {
            stdout?: string | Buffer
            stderr?: string | Buffer
            code?: number | string
            killed?: boolean
        }

        const stdout = typeof execError.stdout === 'string'
            ? execError.stdout
            : execError.stdout
                ? execError.stdout.toString()
                : ''
        const stderr = typeof execError.stderr === 'string'
            ? execError.stderr
            : execError.stderr
                ? execError.stderr.toString()
                : ''

        if (execError.code === 'ETIMEDOUT' || execError.killed) {
            return rpcError('Beads command timed out', {
                stdout,
                stderr,
                exitCode: typeof execError.code === 'number' ? execError.code : -1
            })
        }

        return rpcError(getErrorMessage(error, 'Beads command failed'), {
            stdout,
            stderr,
            exitCode: typeof execError.code === 'number' ? execError.code : 1
        })
    }
}

export function registerBeadHandlers(rpcHandlerManager: RpcHandlerManager, workingDirectory: string): void {
    rpcHandlerManager.registerHandler<BeadsShowRequest, BeadsResponse>('beads.show', async (params) => {
        const beadIds = Array.isArray(params?.beadIds)
            ? params.beadIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : []
        const cwd = resolveRepoPath(params?.repoPath, workingDirectory)
        const args = ['show', ...beadIds, '--json']

        return await runBdJsonCommand(args, cwd, params?.timeout)
    })

    rpcHandlerManager.registerHandler<BeadsListRequest, BeadsResponse>('beads.list', async (params) => {
        const cwd = resolveRepoPath(params?.repoPath, workingDirectory)
        const args = ['list', '--json']
        return await runBdJsonCommand(args, cwd, params?.timeout)
    })
}
