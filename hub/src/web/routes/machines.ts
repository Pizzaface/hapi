import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine } from './guards'

const INITIAL_PROMPT_MAX_LENGTH = 100_000

const spawnBodySchema = z.object({
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

const pathsExistsSchema = z.object({
    paths: z.array(z.string().min(1)).max(1000)
})

const machineGitBranchesSchema = z.object({
    directory: z.string().min(1),
    limit: z.number().int().min(1).max(500).optional()
})

const machineAgentsSchema = z.object({
    directory: z.string().trim().min(1)
})

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

export function createMachinesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/machines', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const namespace = c.get('namespace')
        const machines = engine.getOnlineMachinesByNamespace(namespace)
        return c.json({ machines })
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = spawnBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: mapSpawnBodyValidationError(parsed.error) }, 400)
        }

        const namespace = c.get('namespace')
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

    app.post('/machines/:id/paths/exists', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = pathsExistsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const uniquePaths = Array.from(new Set(parsed.data.paths.map((path) => path.trim()).filter(Boolean)))
        if (uniquePaths.length === 0) {
            return c.json({ exists: {} })
        }

        try {
            const exists = await engine.checkPathsExist(machineId, uniquePaths)
            return c.json({ exists })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to check paths' }, 500)
        }
    })

    app.post('/machines/:id/git/branches', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = machineGitBranchesSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const branches = await engine.getMachineGitBranches(
                machineId,
                parsed.data.directory.trim(),
                parsed.data.limit
            )
            return c.json({ branches })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to list branches' }, 500)
        }
    })

    app.post('/machines/:id/agents', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = machineAgentsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const agents = await engine.listMachineAgents(machineId, parsed.data.directory)
            return c.json({ agents })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to list agents' }, 500)
        }
    })

    return app
}
