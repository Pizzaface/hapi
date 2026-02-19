#!/usr/bin/env bun
import { openSync, closeSync, existsSync, unlinkSync, copyFileSync, chmodSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUILT_BINARY = resolve(REPO_DIR, 'cli/dist-exe/bun-linux-x64/hapi')
const HUB_LOG = resolve(REPO_DIR, 'hub.log')
const PID_FILE = resolve(REPO_DIR, 'hub.pid')
const PORT = 3006

// Resolve global binary: find the npm-installed hapi, excluding our repo copy
async function resolveGlobalBinary(): Promise<string> {
    const proc = Bun.spawn(['which', '-a', 'hapi'], { stdout: 'pipe', stderr: 'ignore' })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    const candidates = output.trim().split('\n').filter(Boolean)
    // Prefer one outside the repo dir
    return candidates.find(p => !p.startsWith(REPO_DIR)) ?? candidates[0] ?? ''
}

function isAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true } catch { return false }
}

async function readPidFile(): Promise<number | null> {
    if (!existsSync(PID_FILE)) return null
    const pid = parseInt(await Bun.file(PID_FILE).text(), 10)
    if (isNaN(pid) || !isAlive(pid)) {
        try { unlinkSync(PID_FILE) } catch {}
        return null
    }
    return pid
}

async function findHubPid(): Promise<number | null> {
    const fromFile = await readPidFile()
    if (fromFile) return fromFile
    // Fallback: pgrep
    const proc = Bun.spawn(['pgrep', '-f', 'hapi hub --no-relay'], { stdout: 'pipe', stderr: 'ignore' })
    const text = await new Response(proc.stdout).text()
    await proc.exited
    const pid = parseInt(text.trim().split('\n')[0], 10)
    return isNaN(pid) ? null : pid
}

async function killPort(): Promise<void> {
    const proc = Bun.spawn(['fuser', '-k', `${PORT}/tcp`], { stdout: 'ignore', stderr: 'ignore' })
    await proc.exited
}

async function isPortFree(): Promise<boolean> {
    try {
        const resp = await fetch(`http://127.0.0.1:${PORT}/health`, {
            signal: AbortSignal.timeout(200)
        })
        void resp.body?.cancel()
        return false // port responded = not free
    } catch {
        return true
    }
}

async function waitPortFree(timeoutMs = 3000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await isPortFree()) return true
        await Bun.sleep(100)
    }
    return false
}

async function stopHub(): Promise<void> {
    const pid = await findHubPid()
    if (!pid) {
        console.log('==> No hub running.')
        try { unlinkSync(PID_FILE) } catch {}
        await killPort()
        return
    }

    console.log(`==> Stopping hub (pid ${pid})...`)
    process.kill(pid, 'SIGTERM')

    // Wait up to 5s for graceful shutdown
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && isAlive(pid)) {
        await Bun.sleep(100)
    }

    if (isAlive(pid)) {
        console.log('==> Force killing hub...')
        try { process.kill(pid, 'SIGKILL') } catch {}
        await Bun.sleep(200)
    }

    try { unlinkSync(PID_FILE) } catch {}
    await killPort()
}

async function startHub(): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        console.log('==> Ensuring port is free...')
        await killPort()
        if (!await waitPortFree()) {
            console.log('==> Port still occupied after wait.')
        }

        console.log(`==> Starting hub (attempt ${attempt}/3)...`)
        // Open log in append mode
        const logFd = openSync(HUB_LOG, 'a')
        const hubProc = Bun.spawn(['hapi', 'hub', '--no-relay'], {
            stdout: logFd,
            stderr: logFd,
            stdin: 'ignore',
        })
        closeSync(logFd)
        hubProc.unref()

        const pid = hubProc.pid
        await Bun.write(PID_FILE, String(pid))

        // Wait up to 15s for health
        console.log('==> Waiting for hub to become ready...')
        const deadline = Date.now() + 15000
        let ready = false
        while (Date.now() < deadline) {
            if (!isAlive(pid)) {
                console.log(`==> Hub process died (pid ${pid}).`)
                break
            }
            try {
                const resp = await fetch(`http://127.0.0.1:${PORT}/health`, {
                    signal: AbortSignal.timeout(500)
                })
                if (resp.ok) { ready = true; break }
                void resp.body?.cancel()
            } catch {}
            await Bun.sleep(100)
        }

        if (ready) {
            console.log(`==> Hub started and healthy (pid ${pid})`)
            return true
        }
        console.log(`==> Attempt ${attempt} failed.`)
    }

    console.error('==> ERROR: Hub failed to start after 3 attempts! Last 20 lines of hub.log:')
    const tail = Bun.spawn(['tail', '-20', HUB_LOG], { stdout: 'inherit', stderr: 'inherit' })
    await tail.exited
    return false
}

async function build(): Promise<boolean> {
    console.log('==> Building hapi...')
    const install = Bun.spawn(['bun', 'install', '--silent'], {
        cwd: REPO_DIR, stdout: 'inherit', stderr: 'inherit'
    })
    if (await install.exited !== 0) return false

    const buildProc = Bun.spawn(['bun', 'run', 'build:single-exe'], {
        cwd: REPO_DIR, stdout: 'inherit', stderr: 'inherit'
    })
    return await buildProc.exited === 0
}

// --- Main ---
const cmd = process.argv[2] ?? ''

if (cmd === 'stop') {
    await stopHub()
    console.log('==> Hub stopped.')
    process.exit(0)
}

if (cmd === 'logs') {
    const proc = Bun.spawn(['tail', '-f', HUB_LOG], { stdout: 'inherit', stderr: 'inherit' })
    process.exit(await proc.exited)
}

if (cmd === 'status') {
    const pid = await findHubPid()
    console.log(pid ? `Hub running (pid ${pid})` : 'Hub not running')
    process.exit(0)
}

if (cmd === 'restart') {
    await stopHub()
    const ok = await startHub()
    process.exit(ok ? 0 : 1)
}

// Default: full rebuild cycle
await stopHub()

const globalBinary = await resolveGlobalBinary()
if (!globalBinary) {
    console.error('==> Could not find global hapi binary. Skipping binary replacement.')
}

const backup = globalBinary ? `${globalBinary}.bak` : ''

// Backup current binary
if (globalBinary && existsSync(globalBinary)) {
    copyFileSync(globalBinary, backup)
}

if (await build()) {
    if (globalBinary) {
        console.log('==> Build succeeded. Replacing global binary...')
        try { unlinkSync(globalBinary) } catch {}
        copyFileSync(BUILT_BINARY, globalBinary)
        chmodSync(globalBinary, 0o755)
        if (backup) try { unlinkSync(backup) } catch {}
        // Print version
        const ver = Bun.spawn([globalBinary, '--version'], { stdout: 'pipe', stderr: 'ignore' })
        const version = await new Response(ver.stdout).text()
        await ver.exited
        console.log(`==> Installed: ${version.trim()}`)
    }
} else {
    console.error('==> BUILD FAILED.')
    if (backup && existsSync(backup)) {
        try { unlinkSync(globalBinary) } catch {}
        copyFileSync(backup, globalBinary)
        console.log('==> Restored previous binary.')
    }
}

// Always restart
const ok = await startHub()
process.exit(ok ? 0 : 1)
