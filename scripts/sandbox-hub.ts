#!/usr/bin/env bun
import { openSync, closeSync, existsSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATE_FILE = '/tmp/hapi-sandbox.json'

type SandboxState = {
    pid: number
    port: number
    home: string
    startedAt: number
    token: string
    warmPid?: number
}

function isAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true } catch { return false }
}

async function readState(): Promise<SandboxState | null> {
    if (!existsSync(STATE_FILE)) return null
    try {
        return JSON.parse(await Bun.file(STATE_FILE).text())
    } catch {
        return null
    }
}

async function findFreePort(preferred?: number): Promise<number> {
    if (preferred) {
        try {
            await fetch(`http://127.0.0.1:${preferred}/health`, { signal: AbortSignal.timeout(200) })
            // Something responded — port is in use
        } catch {
            return preferred
        }
    }
    return new Promise((resolve, reject) => {
        const server = createServer()
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as { port: number }
            server.close(() => resolve(addr.port))
        })
        server.on('error', reject)
    })
}

async function cleanStale(): Promise<void> {
    const state = await readState()
    if (!state) return

    if (isAlive(state.pid)) {
        console.error(`Sandbox already running on port ${state.port} (pid ${state.pid}).`)
        console.error('Stop it first: bun scripts/sandbox-hub.ts stop')
        process.exit(1)
    }

    // Dead process — clean up
    if (existsSync(state.home)) {
        rmSync(state.home, { recursive: true, force: true })
    }
    try { unlinkSync(STATE_FILE) } catch {}
}

async function start(args: string[]): Promise<void> {
    let preferredPort: number | undefined
    let seed = false
    let dev = false
    let noWarm = false

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port') preferredPort = parseInt(args[++i], 10)
        else if (args[i] === '--seed') seed = true
        else if (args[i] === '--dev') dev = true
        else if (args[i] === '--no-warm') noWarm = true
    }

    await cleanStale()

    const port = await findFreePort(preferredPort)
    const home = mkdtempSync(join(tmpdir(), 'hapi-sandbox-'))
    const dbPath = join(home, 'hapi.db')
    const hubLog = join(home, 'hub.log')

    // Seed before starting the hub (no contention)
    if (seed) {
        console.log('==> Seeding fixtures...')
        const seedScript = resolve(dirname(fileURLToPath(import.meta.url)), 'seed-fixtures.ts')
        const seedProc = Bun.spawn(['bun', seedScript, '--db', dbPath], {
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const seedExit = await seedProc.exited
        if (seedExit !== 0) {
            rmSync(home, { recursive: true, force: true })
            console.error('==> Seed failed.')
            process.exit(1)
        }
    }

    // Spawn hub
    for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`==> Starting sandbox hub on port ${port} (attempt ${attempt}/3)...`)
        const logFd = openSync(hubLog, 'a')
        // --dev: run hub from TypeScript source so web/dist changes are picked
        // up without rebuilding the global binary. The hub's findWebappDistDir()
        // resolves web/dist relative to cwd, so bun run build:web is sufficient.
        const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
        const hubCmd = dev
            ? ['bun', join(projectRoot, 'hub/src/index.ts'), '--no-relay']
            : ['hapi', 'hub', '--no-relay']

        const hubProc = Bun.spawn(hubCmd, {
            cwd: dev ? projectRoot : undefined,
            env: {
                ...process.env,
                HAPI_HOME: home,
                HAPI_LISTEN_PORT: String(port),
                DB_PATH: dbPath,
            },
            stdout: logFd,
            stderr: logFd,
            stdin: 'ignore',
        })
        closeSync(logFd)
        hubProc.unref()

        const pid = hubProc.pid

        // Wait up to 15s for health
        const deadline = Date.now() + 15_000
        let ready = false
        while (Date.now() < deadline) {
            if (!isAlive(pid)) break
            try {
                const resp = await fetch(`http://127.0.0.1:${port}/health`, {
                    signal: AbortSignal.timeout(500),
                })
                if (resp.ok) { ready = true; break }
                void resp.body?.cancel()
            } catch {}
            await Bun.sleep(100)
        }

        if (ready) {
            // Read token from auto-generated settings
            const settingsPath = join(home, 'settings.json')
            let token = ''
            try {
                const settings = JSON.parse(await Bun.file(settingsPath).text())
                token = settings.cliApiToken ?? ''
            } catch {}

            const state: SandboxState = { pid, port, home, startedAt: Date.now(), token }

            // Start warm-sandbox to keep seeded sessions alive with specific states
            if (seed && !noWarm) {
                const warmScript = resolve(dirname(fileURLToPath(import.meta.url)), 'warm-sandbox.ts')
                const warmLogFd = openSync(hubLog, 'a')
                const warmProc = Bun.spawn(['bun', warmScript], {
                    cwd: join(projectRoot, 'cli'),
                    env: {
                        ...process.env,
                        SANDBOX_PORT: String(port),
                        SANDBOX_TOKEN: token,
                        SANDBOX_DB: dbPath,
                    },
                    stdout: warmLogFd,
                    stderr: warmLogFd,
                    stdin: 'ignore',
                })
                closeSync(warmLogFd)
                warmProc.unref()
                state.warmPid = warmProc.pid
                console.log(`==> Warm-sandbox started (pid ${warmProc.pid})`)
            }

            await Bun.write(STATE_FILE, JSON.stringify(state, null, 2))

            console.log(`==> Sandbox hub ready (pid ${pid}${dev ? ', dev mode' : ''})`)
            console.log(`SANDBOX_URL=http://127.0.0.1:${port}`)
            console.log(`SANDBOX_HOME=${home}`)
            console.log(`SANDBOX_TOKEN=${token}`)
            return
        }

        console.log(`==> Attempt ${attempt} failed.`)
        try { process.kill(pid, 'SIGKILL') } catch {}
    }

    console.error('==> Sandbox hub failed to start after 3 attempts. Log:')
    const tail = Bun.spawn(['tail', '-20', hubLog], { stdout: 'inherit', stderr: 'inherit' })
    await tail.exited
    rmSync(home, { recursive: true, force: true })
    process.exit(1)
}

async function stop(): Promise<void> {
    const state = await readState()
    if (!state || !isAlive(state.pid)) {
        console.log('No sandbox running.')
        // Clean up leftover state/dirs
        if (state?.home && existsSync(state.home)) {
            rmSync(state.home, { recursive: true, force: true })
        }
        try { unlinkSync(STATE_FILE) } catch {}
        return
    }

    // Stop warm-sandbox first
    if (state.warmPid && isAlive(state.warmPid)) {
        console.log(`==> Stopping warm-sandbox (pid ${state.warmPid})...`)
        try { process.kill(state.warmPid, 'SIGTERM') } catch {}
    }

    console.log(`==> Stopping sandbox (pid ${state.pid})...`)
    process.kill(state.pid, 'SIGTERM')

    const deadline = Date.now() + 5000
    while (Date.now() < deadline && isAlive(state.pid)) {
        await Bun.sleep(100)
    }
    if (isAlive(state.pid)) {
        try { process.kill(state.pid, 'SIGKILL') } catch {}
        await Bun.sleep(200)
    }

    if (existsSync(state.home)) {
        rmSync(state.home, { recursive: true, force: true })
    }
    try { unlinkSync(STATE_FILE) } catch {}
    console.log('==> Sandbox stopped and cleaned up.')
}

async function status(): Promise<void> {
    const state = await readState()
    if (!state || !isAlive(state.pid)) {
        console.log('No sandbox running.')
        process.exit(0)
    }
    const started = new Date(state.startedAt).toISOString()
    const warm = state.warmPid && isAlive(state.warmPid) ? ` warm=${state.warmPid}` : ''
    console.log(`Sandbox running: pid=${state.pid} port=${state.port} home=${state.home} started=${started}${warm}`)
}

// --- Main ---
const cmd = process.argv[2] ?? ''
const args = process.argv.slice(3)

switch (cmd) {
    case 'start': await start(args); break
    case 'stop': await stop(); break
    case 'status': await status(); break
    default:
        console.log(`Usage: bun scripts/sandbox-hub.ts <start|stop|status>

  start [--port <n>] [--seed] [--dev] [--no-warm]   Start isolated hub
    --seed      Populate DB with fixture data
    --dev       Run hub from TypeScript source (serves web/dist from disk)
    --no-warm   Skip warm-sandbox (sessions will go offline after 30s)
  stop                                               Kill sandbox and clean up
  status                                             Check if sandbox is running`)
        process.exit(cmd ? 1 : 0)
}
