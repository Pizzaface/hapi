#!/usr/bin/env bun
/**
 * Keep seeded sandbox sessions alive with specific states for screenshots.
 *
 * Connects to the sandbox hub via socket.io and sends periodic session-alive
 * keepalive events so sessions don't expire (30s timeout). Each session gets
 * a specific state (thinking, thinkingActivity) for visual diversity.
 *
 * Environment variables (set by sandbox-hub.ts):
 *   SANDBOX_PORT   — hub port
 *   SANDBOX_TOKEN  — CLI API token
 *   SANDBOX_DB     — path to sandbox hapi.db
 *
 * Can also read from /tmp/hapi-sandbox.json if env vars are not set.
 */
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { io, type Socket } from 'socket.io-client'

const STATE_FILE = '/tmp/hapi-sandbox.json'
const KEEPALIVE_INTERVAL_MS = 12_000 // Must be well under 30s (hub inactive expiry)

// ── Warm state definitions ──────────────────────────────────────────────────
// Matched by session metadata.name (since IDs are random per seed run)

type WarmState = {
    thinking: boolean
    thinkingActivity?: 'compacting' | null
}

const WARM_STATES: Record<string, WarmState> = {
    'Refactor auth middleware': { thinking: true },
    'Staging DB cluster': { thinking: false },  // Already has pending request → amber dot
    'Convert class components to hooks': { thinking: true, thinkingActivity: 'compacting' },
}

// ── Resolve config ──────────────────────────────────────────────────────────

type Config = {
    port: number
    token: string
    dbPath: string
}

async function resolveConfig(): Promise<Config> {
    const port = process.env.SANDBOX_PORT
    const token = process.env.SANDBOX_TOKEN
    const dbPath = process.env.SANDBOX_DB

    if (port && token && dbPath) {
        return { port: parseInt(port, 10), token, dbPath }
    }

    // Fallback: read from state file
    if (!existsSync(STATE_FILE)) {
        console.error('[warm] No sandbox state found. Start the sandbox first.')
        process.exit(1)
    }

    const text = await Bun.file(STATE_FILE).text()
    const state = JSON.parse(text)
    return {
        port: state.port,
        token: state.token,
        dbPath: state.home + '/hapi.db',
    }
}

// ── Read session IDs from DB ────────────────────────────────────────────────

type SessionInfo = {
    id: string
    name: string
}

function readActiveSessions(dbPath: string): SessionInfo[] {
    const db = new Database(dbPath, { readonly: true })
    const rows = db.prepare(
        `SELECT id, metadata FROM sessions WHERE active = 1`
    ).all() as Array<{ id: string; metadata: string }>
    db.close()

    return rows.map(row => {
        const meta = JSON.parse(row.metadata)
        return { id: row.id, name: meta.name ?? '' }
    })
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const config = await resolveConfig()
    const sessions = readActiveSessions(config.dbPath)

    if (sessions.length === 0) {
        console.log('[warm] No active sessions in DB. Nothing to warm.')
        process.exit(0)
    }

    // Build session → warm state mapping
    const targets = sessions
        .filter(s => s.name in WARM_STATES)
        .map(s => ({ ...s, state: WARM_STATES[s.name] }))

    if (targets.length === 0) {
        console.log('[warm] No sessions match warm state definitions.')
        process.exit(0)
    }

    console.log(`[warm] Warming ${targets.length} sessions on port ${config.port}:`)
    for (const t of targets) {
        const parts = [t.state.thinking ? 'thinking' : 'keepalive']
        if (t.state.thinkingActivity) parts.push(t.state.thinkingActivity)
        console.log(`  ${t.name} → ${parts.join(' + ')}`)
    }

    // Connect to hub via socket.io /cli namespace
    // Hub /cli namespace only checks auth.token (parsed via parseAccessToken)
    const socket: Socket = io(`http://127.0.0.1:${config.port}/cli`, {
        auth: { token: config.token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
    })

    let connected = false

    socket.on('connect', () => {
        connected = true
        console.log('[warm] Connected to hub socket.io')
        sendKeepalives()
    })

    socket.on('connect_error', (err: Error) => {
        console.error(`[warm] Connection error: ${err.message}`)
    })

    socket.on('disconnect', (reason: string) => {
        connected = false
        console.log(`[warm] Disconnected: ${reason}`)
    })

    function sendKeepalives(): void {
        const time = Date.now()
        for (const target of targets) {
            socket.emit('session-alive', {
                sid: target.id,
                time,
                thinking: target.state.thinking,
                thinkingActivity: target.state.thinkingActivity ?? null,
            })
        }
    }

    // Send keepalives on interval
    const interval = setInterval(() => {
        if (connected) {
            sendKeepalives()
        }
    }, KEEPALIVE_INTERVAL_MS)

    // Graceful shutdown
    const cleanup = () => {
        console.log('[warm] Shutting down...')
        clearInterval(interval)
        socket.disconnect()
        process.exit(0)
    }

    process.on('SIGTERM', cleanup)
    process.on('SIGINT', cleanup)

    // Wait for connection with timeout
    const deadline = Date.now() + 10_000
    while (!connected && Date.now() < deadline) {
        await Bun.sleep(100)
    }

    if (!connected) {
        console.error('[warm] Failed to connect within 10s')
        socket.disconnect()
        process.exit(1)
    }

    // Keep alive until killed
    console.log(`[warm] Sending keepalives every ${KEEPALIVE_INTERVAL_MS / 1000}s (Ctrl+C or SIGTERM to stop)`)
}

main().catch(err => {
    console.error('[warm] Fatal:', err)
    process.exit(1)
})
