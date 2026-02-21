import { Hono } from 'hono'
import { z } from 'zod'
import type { TeamSummary } from '@hapi/protocol/types'
import type { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

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

const groupSortOrderSchema = z.object({
    groupKey: z.string().min(1),
    sortOrder: z.string().min(1).max(50)
})

const acceptAllMessagesSchema = z.object({
    acceptAllMessages: z.boolean()
})

export function createTeamsRoutes(store: Store, getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/teams', (c) => {
        const namespace = c.get('namespace')
        const storedTeams = store.teams.getTeamsByNamespace(namespace)

        const teams: TeamSummary[] = storedTeams.map((team) => ({
            id: team.id,
            name: team.name,
            color: team.color,
            persistent: team.persistent,
            sortOrder: team.sortOrder,
            memberSessionIds: store.teams.getTeamMembers(team.id, namespace)
        }))

        return c.json({ teams })
    })

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

    app.patch('/group-sort-orders', async (c) => {
        const namespace = c.get('namespace')
        const json = await c.req.json().catch(() => null)
        const parsed = groupSortOrderSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        store.teams.upsertGroupSortOrder(parsed.data.groupKey, namespace, parsed.data.sortOrder)
        return c.json({ ok: true })
    })

    app.post('/sessions/:id/accept-all-messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const json = await c.req.json().catch(() => null)
        const parsed = acceptAllMessagesSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const updated = store.sessions.setAcceptAllMessages(sessionResult.sessionId, parsed.data.acceptAllMessages, namespace)
        if (!updated) {
            return c.json({ error: 'Session not found' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
