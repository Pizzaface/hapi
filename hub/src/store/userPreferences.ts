import type { Database } from 'bun:sqlite'

export type StoredUserPreferences = {
    namespace: string
    readyAnnouncements: boolean
    permissionNotifications: boolean
    errorNotifications: boolean
    teamGroupStyle: string
    updatedAt: number
}

export type UserPreferencesUpdate = {
    readyAnnouncements?: boolean
    permissionNotifications?: boolean
    errorNotifications?: boolean
    teamGroupStyle?: string
}

type DbUserPreferencesRow = {
    namespace: string
    ready_announcements: number
    permission_notifications: number
    error_notifications: number
    team_group_style: string
    updated_at: number
}

function toStoredUserPreferences(row: DbUserPreferencesRow): StoredUserPreferences {
    return {
        namespace: row.namespace,
        readyAnnouncements: row.ready_announcements !== 0,
        permissionNotifications: row.permission_notifications !== 0,
        errorNotifications: row.error_notifications !== 0,
        teamGroupStyle: row.team_group_style,
        updatedAt: row.updated_at
    }
}

export function getUserPreferences(db: Database, namespace: string): StoredUserPreferences {
    const row = db.prepare(
        'SELECT * FROM user_preferences WHERE namespace = ? LIMIT 1'
    ).get(namespace) as DbUserPreferencesRow | undefined

    if (!row) {
        return {
            namespace,
            readyAnnouncements: true,
            permissionNotifications: true,
            errorNotifications: true,
            teamGroupStyle: 'card',
            updatedAt: 0
        }
    }

    return toStoredUserPreferences(row)
}

export function upsertUserPreferences(
    db: Database,
    namespace: string,
    updates: UserPreferencesUpdate
): StoredUserPreferences {
    const current = getUserPreferences(db, namespace)
    const now = Date.now()

    const next: StoredUserPreferences = {
        namespace,
        readyAnnouncements: updates.readyAnnouncements ?? current.readyAnnouncements,
        permissionNotifications: updates.permissionNotifications ?? current.permissionNotifications,
        errorNotifications: updates.errorNotifications ?? current.errorNotifications,
        teamGroupStyle: updates.teamGroupStyle ?? current.teamGroupStyle,
        updatedAt: now
    }

    db.prepare(`
        INSERT INTO user_preferences (namespace, ready_announcements, permission_notifications, error_notifications, team_group_style, updated_at)
        VALUES (@namespace, @ready_announcements, @permission_notifications, @error_notifications, @team_group_style, @updated_at)
        ON CONFLICT(namespace) DO UPDATE SET
            ready_announcements = excluded.ready_announcements,
            permission_notifications = excluded.permission_notifications,
            error_notifications = excluded.error_notifications,
            team_group_style = excluded.team_group_style,
            updated_at = excluded.updated_at
    `).run({
        namespace,
        ready_announcements: next.readyAnnouncements ? 1 : 0,
        permission_notifications: next.permissionNotifications ? 1 : 0,
        error_notifications: next.errorNotifications ? 1 : 0,
        team_group_style: next.teamGroupStyle,
        updated_at: now
    })

    return next
}

/** @deprecated Use upsertUserPreferences instead */
export function upsertReadyAnnouncementsPreference(
    db: Database,
    namespace: string,
    readyAnnouncements: boolean
): StoredUserPreferences {
    return upsertUserPreferences(db, namespace, { readyAnnouncements })
}
