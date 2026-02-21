import type { Session } from '../sync/syncEngine'

export type NotificationChannel = {
    sendReady: (session: Session) => Promise<void>
    sendPermissionRequest: (session: Session) => Promise<void>
}

export type PreferencesStore = {
    get: (namespace: string) => {
        readyAnnouncements: boolean
        permissionNotifications: boolean
        errorNotifications: boolean
    }
}

export type NotificationHubOptions = {
    readyCooldownMs?: number
    permissionDebounceMs?: number
    preferencesStore?: PreferencesStore
}
