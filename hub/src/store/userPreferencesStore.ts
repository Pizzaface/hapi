import type { Database } from 'bun:sqlite'

import type { StoredUserPreferences, UserPreferencesUpdate } from './userPreferences'
import { getUserPreferences, upsertUserPreferences } from './userPreferences'

export class UserPreferencesStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    get(namespace: string): StoredUserPreferences {
        return getUserPreferences(this.db, namespace)
    }

    update(namespace: string, updates: UserPreferencesUpdate): StoredUserPreferences {
        return upsertUserPreferences(this.db, namespace, updates)
    }

    /** @deprecated Use update() instead */
    setReadyAnnouncements(namespace: string, readyAnnouncements: boolean): StoredUserPreferences {
        return this.update(namespace, { readyAnnouncements })
    }
}
