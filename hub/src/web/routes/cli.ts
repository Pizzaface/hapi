import { Hono } from 'hono'
import { z } from 'zod'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import type { Store } from '../../store'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'

const bearerSchema = z.string().regex(/^Bearer\s+(.+)$/i)
const INITIAL_PROMPT_MAX_LENGTH = 100_000

const createOrLoadSessionSchema = z.object({
    tag: z.string().min(1),
    metadata: z.unknown(),
    agentState: z.unknown().nullable().optional()
})

const createOrLoadMachineSchema = z.object({
    id: z.string().min(1),
    metadata: z.unknown(),
    runnerState: z.unknown().nullable().optional()
})

const spawnMachineSessionSchema = z.object({
    directory: z.string().min(1),
    agent: z.enum(['claude', 'codex', 'gemini', 'opencode']).optional(),
    model: z.string().optional(),
    yolo: z.boolean().optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().optional(),
    worktreeBranch: z.string().optional(),
    initialPrompt: z.string().max(INITIAL_PROMPT_MAX_LENGTH).optional(),
    teamId: z.string().optional()
})

const restartSessionsSchema = z.object({
    sessionIds: z.array(z.string().min(1)).optional(),
    machineId: z.string().min(1).optional()
})

const interAgentMessageSchema = z.object({
    senderSessionId: z.string().min(1),
    content: z.string().min(1).max(100_000),
    hopCount: z.number().int().min(0).max(10).optional()
})

const getMessagesQuerySchema = z.object({
    afterSeq: z.coerce.number().int().min(0),
    limit: z.coerce.number().int().min(1).max(200).optional()
})

const createTeamSchema = z.object({
    name: z.string().min(1).max(255),
    color: z.string().max(50).optional(),
    persistent: z.boolean().optional(),
    ttlSeconds: z.number().int().min(0).optional(),
    sortOrder: z.string().max(50).optional()
})

const updateTeamSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    color: z.string().max(50).nullable().optional(),
    sortOrder: z.string().max(50).nullable().optional(),
    ttlSeconds: z.number().int().min(0).optional()
})

const teamMembershipSchema = z.object({
    sessionId: z.string().min(1)
})

type CliEnv = {
    Variables: {
        namespace: string
    }
}

function mapSpawnBodyValidationError(error: z.ZodError): string {
    const hasOversizedPrompt = error.issues.some((issue) => (
        issue.path.length === 1
        && issue.path[0] === 'initialPrompt'
        && issue.code === 'too_big'
    ))
    if (hasOversizedPrompt) {
        return `Invalid body: initialPrompt must be at most ${INITIAL_PROMPT_MAX_LENGTH} characters`
    }
    return 'Invalid body'
}

function resolveSessionForNamespace(
    engine: SyncEngine,
    sessionId: string,
    namespace: string
): { ok: true; session: Session; sessionId: string } | { ok: false; status: 403 | 404; error: string } {
    const access = engine.resolveSessionAccess(sessionId, namespace)
    if (access.ok) {
        return { ok: true, session: access.session, sessionId: access.sessionId }
    }
    return {
        ok: false,
        status: access.reason === 'access-denied' ? 403 : 404,
        error: access.reason === 'access-denied' ? 'Session access denied' : 'Session not found'
    }
}

function resolveMachineForNamespace(
    engine: SyncEngine,
    machineId: string,
    namespace: string
): { ok: true; machine: Machine } | { ok: false; status: 403 | 404; error: string } {
    const machine = engine.getMachineByNamespace(machineId, namespace)
    if (machine) {
        return { ok: true, machine }
    }
    if (engine.getMachine(machineId)) {
        return { ok: false, status: 403, error: 'Machine access denied' }
    }
    return { ok: false, status: 404, error: 'Machine not found' }
}

export function createCliRoutes(getSyncEngine: () => SyncEngine | null, store: Store): Hono<CliEnv> {
    const app = new Hono<CliEnv>()

    app.use('*', async (c, next) => {
        c.header('X-Hapi-Protocol-Version', String(PROTOCOL_VERSION))

        const raw = c.req.header('authorization')
        if (!raw) {
            return c.json({ error: 'Missing Authorization header' }, 401)
        }

        const parsed = bearerSchema.safeParse(raw)
        if (!parsed.success) {
            return c.json({ error: 'Invalid Authorization header' }, 401)
        }

        const token = parsed.data.replace(/^Bearer\s+/i, '')
        const parsedToken = parseAccessToken(token)
        if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid token' }, 401)
        }

        c.set('namespace', parsedToken.namespace)
        return await next()
    })

    app.post('/sessions', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const json = await c.req.json().catch(() => null)
        const parsed = createOrLoadSessionSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const session = engine.getOrCreateSession(parsed.data.tag, parsed.data.metadata, parsed.data.agentState ?? null, namespace)
        return c.json({ session })
    })

    app.get('/sessions/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveSessionForNamespace(engine, sessionId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }
        return c.json({ session: resolved.session })
    })

    app.get('/sessions/:id/messages', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveSessionForNamespace(engine, sessionId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const parsed = getMessagesQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const limit = parsed.data.limit ?? 200
        const messages = engine.getMessagesAfter(resolved.sessionId, { afterSeq: parsed.data.afterSeq, limit })
        return c.json({ messages })
    })

    app.post('/machines', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const json = await c.req.json().catch(() => null)
        const parsed = createOrLoadMachineSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const existing = engine.getMachine(parsed.data.id)
        if (existing && existing.namespace !== namespace) {
            return c.json({ error: 'Machine access denied' }, 403)
        }
        const machine = engine.getOrCreateMachine(parsed.data.id, parsed.data.metadata, parsed.data.runnerState ?? null, namespace)
        return c.json({ machine })
    })

    app.get('/machines/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const machineId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveMachineForNamespace(engine, machineId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }
        return c.json({ machine: resolved.machine })
    })

    app.get('/machines', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }

        const namespace = c.get('namespace')
        const machines = engine.getOnlineMachinesByNamespace(namespace)
        return c.json({ machines })
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }

        const machineId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveMachineForNamespace(engine, machineId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const json = await c.req.json().catch(() => null)
        const parsed = spawnMachineSessionSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: mapSpawnBodyValidationError(parsed.error) }, 400)
        }

        const result = await engine.spawnSession({
            machineId,
            directory: parsed.data.directory,
            agent: parsed.data.agent,
            model: parsed.data.model,
            yolo: parsed.data.yolo,
            sessionType: parsed.data.sessionType,
            worktreeName: parsed.data.worktreeName,
            worktreeBranch: parsed.data.worktreeBranch,
            initialPrompt: parsed.data.initialPrompt,
            teamId: parsed.data.teamId,
            namespace
        })

        return c.json(result)
    })

    app.post('/restart-sessions', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }

        const json = await c.req.json().catch(() => null)
        const parsed = restartSessionsSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const results = await engine.restartSessions(namespace, {
            sessionIds: parsed.data.sessionIds,
            machineId: parsed.data.machineId
        })

        return c.json({ results })
    })

    app.post('/sessions/:targetId/message', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }

        const targetId = c.req.param('targetId')
        const namespace = c.get('namespace')

        const json = await c.req.json().catch(() => null)
        const parsed = interAgentMessageSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const result = await engine.sendInterAgentMessage(
            parsed.data.senderSessionId,
            targetId,
            parsed.data.content,
            namespace,
            parsed.data.hopCount ?? 0
        )

        if (result.status === 'error') {
            const statusCode = result.code === 'sender_not_found' || result.code === 'target_not_found' ? 404
                : result.code === 'not_authorized' ? 403
                : result.code === 'message_too_large' || result.code === 'hop_limit_exceeded' ? 400
                : 500
            return c.json({ error: result.message, code: result.code }, statusCode)
        }

        return c.json(result)
    })

    app.get('/sessions', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }

        const namespace = c.get('namespace')
        const sessions = engine.getSessionsByNamespace(namespace)

        const activeOnly = c.req.query('active')
        const filtered = activeOnly === 'true'
            ? sessions.filter((s) => s.active)
            : sessions

        const summaries = filtered.map((s) => ({
            id: s.id,
            active: s.active,
            name: s.metadata?.name ?? null,
            path: s.metadata?.path ?? null,
            flavor: s.metadata?.flavor ?? null,
            machineId: s.metadata?.machineId ?? null,
            parentSessionId: s.parentSessionId ?? null,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
        }))

        return c.json({ sessions: summaries })
    })

    // --- Team CRUD ---

    app.post('/teams', async (c) => {
        const namespace = c.get('namespace')
        const json = await c.req.json().catch(() => null)
        const parsed = createTeamSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const team = store.teams.createTeam(parsed.data.name, namespace, {
                color: parsed.data.color,
                persistent: parsed.data.persistent,
                ttlSeconds: parsed.data.ttlSeconds,
                sortOrder: parsed.data.sortOrder
            })
            return c.json({ team }, 201)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create team'
            if (message.includes('UNIQUE')) {
                return c.json({ error: 'Team name already exists in this namespace' }, 409)
            }
            return c.json({ error: message }, 500)
        }
    })

    app.get('/teams', (c) => {
        const namespace = c.get('namespace')
        const teams = store.teams.getTeamsByNamespace(namespace)
        return c.json({ teams })
    })

    app.get('/teams/:id', (c) => {
        const namespace = c.get('namespace')
        const teamId = c.req.param('id')
        const team = store.teams.getTeam(teamId, namespace)
        if (!team) {
            return c.json({ error: 'Team not found' }, 404)
        }
        const members = store.teams.getTeamMembers(teamId, namespace)
        return c.json({ team, members })
    })

    app.patch('/teams/:id', async (c) => {
        const namespace = c.get('namespace')
        const teamId = c.req.param('id')
        const json = await c.req.json().catch(() => null)
        const parsed = updateTeamSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const updated = store.teams.updateTeam(teamId, namespace, parsed.data)
            if (!updated) {
                return c.json({ error: 'Team not found' }, 404)
            }
            const team = store.teams.getTeam(teamId, namespace)
            return c.json({ team })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update team'
            return c.json({ error: message }, 400)
        }
    })

    app.delete('/teams/:id', (c) => {
        const namespace = c.get('namespace')
        const teamId = c.req.param('id')

        try {
            const deleted = store.teams.deleteTeam(teamId, namespace)
            if (!deleted) {
                return c.json({ error: 'Team not found' }, 404)
            }
            return c.json({ ok: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete team'
            return c.json({ error: message }, 400)
        }
    })

    app.post('/teams/:id/join', async (c) => {
        const namespace = c.get('namespace')
        const teamId = c.req.param('id')
        const json = await c.req.json().catch(() => null)
        const parsed = teamMembershipSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const added = store.teams.addMember(teamId, parsed.data.sessionId, namespace)
        if (!added) {
            return c.json({ error: 'Failed to join team (team not found or session already in a team)' }, 400)
        }
        return c.json({ ok: true })
    })

    app.delete('/teams/:id/leave', async (c) => {
        const namespace = c.get('namespace')
        const teamId = c.req.param('id')
        const json = await c.req.json().catch(() => null)
        const parsed = teamMembershipSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const removed = store.teams.removeMember(teamId, parsed.data.sessionId, namespace)
        if (!removed) {
            return c.json({ error: 'Member not found in team' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
