const READY_ANNOUNCEMENTS_KEY = 'hapi-ready-announcements'
const PERMISSION_NOTIFICATIONS_KEY = 'hapi-permission-notifications'

export function isReadyAnnouncementsEnabled(): boolean {
    try {
        const value = localStorage.getItem(READY_ANNOUNCEMENTS_KEY)
        if (value == null) return true
        return value !== '0'
    } catch {
        return true
    }
}

export function setReadyAnnouncementsEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(READY_ANNOUNCEMENTS_KEY, enabled ? '1' : '0')
    } catch {
        // Ignore storage errors (private mode / disabled storage)
    }
}

export function isPermissionNotificationsEnabled(): boolean {
    try {
        const value = localStorage.getItem(PERMISSION_NOTIFICATIONS_KEY)
        if (value == null) return true
        return value !== '0'
    } catch {
        return true
    }
}

export function setPermissionNotificationsEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(PERMISSION_NOTIFICATIONS_KEY, enabled ? '1' : '0')
    } catch {
        // Ignore storage errors (private mode / disabled storage)
    }
}
