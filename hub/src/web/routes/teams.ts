import { Hono } from 'hono'
import type { TeamSummary } from '@hapi/protocol/types'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

export function createTeamsRoutes(store: Store): Hono<WebAppEnv> {
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

    return app
}
