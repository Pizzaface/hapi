import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const updatePreferencesSchema = z.object({
    readyAnnouncements: z.boolean().optional(),
    permissionNotifications: z.boolean().optional(),
    errorNotifications: z.boolean().optional(),
    teamGroupStyle: z.enum(['card', 'left-border']).optional()
})

export function createPreferencesRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/preferences', (c) => {
        const namespace = c.get('namespace')
        const preferences = store.userPreferences.get(namespace)
        return c.json({
            readyAnnouncements: preferences.readyAnnouncements,
            permissionNotifications: preferences.permissionNotifications,
            errorNotifications: preferences.errorNotifications,
            teamGroupStyle: preferences.teamGroupStyle
        })
    })

    app.post('/preferences', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = updatePreferencesSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const saved = store.userPreferences.update(namespace, parsed.data)

        return c.json({
            ok: true,
            preferences: {
                readyAnnouncements: saved.readyAnnouncements,
                permissionNotifications: saved.permissionNotifications,
                errorNotifications: saved.errorNotifications,
                teamGroupStyle: saved.teamGroupStyle
            }
        })
    })

    return app
}
