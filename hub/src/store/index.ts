import { Database } from 'bun:sqlite'
import { generateKeyBetween } from 'fractional-indexing'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { PushStore } from './pushStore'
import { SessionStore } from './sessionStore'
import { SessionBeadStore } from './sessionBeadStore'
import { TeamStore } from './teamStore'
import { UserStore } from './userStore'
import { UserPreferencesStore } from './userPreferencesStore'

export type {
    StoredMachine,
    StoredMessage,
    StoredBeadSnapshot,
    StoredPushSubscription,
    StoredSession,
    StoredSessionBead,
    StoredTeam,
    StoredUser,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { PushStore } from './pushStore'
export { SessionStore } from './sessionStore'
export { SessionBeadStore } from './sessionBeadStore'
export { TeamStore } from './teamStore'
export { UserStore } from './userStore'

const SCHEMA_VERSION: number = 9
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'users',
    'push_subscriptions',
    'user_preferences',
    'session_beads',
    'bead_snapshots',
    'teams',
    'team_members',
    'group_sort_orders'
] as const

export class Store {
    private db: Database
    private readonly dbPath: string

    readonly sessions: SessionStore
    readonly machines: MachineStore
    readonly messages: MessageStore
    readonly users: UserStore
    readonly push: PushStore
    readonly userPreferences: UserPreferencesStore
    readonly sessionBeads: SessionBeadStore
    readonly teams: TeamStore

    constructor(dbPath: string) {
        this.dbPath = dbPath
        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            const dir = dirname(dbPath)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            try {
                chmodSync(dir, 0o700)
            } catch {
            }

            if (!existsSync(dbPath)) {
                try {
                    const fd = openSync(dbPath, 'a', 0o600)
                    closeSync(fd)
                } catch {
                }
            }
        }

        this.db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        this.db.exec('PRAGMA journal_mode = WAL')
        this.db.exec('PRAGMA synchronous = NORMAL')
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 5000')
        this.initSchema()

        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
                try {
                    chmodSync(path, 0o600)
                } catch {
                }
            }
        }

        this.sessions = new SessionStore(this.db)
        this.machines = new MachineStore(this.db)
        this.messages = new MessageStore(this.db)
        this.users = new UserStore(this.db)
        this.push = new PushStore(this.db)
        this.userPreferences = new UserPreferencesStore(this.db)
        this.sessionBeads = new SessionBeadStore(this.db)
        this.teams = new TeamStore(this.db)
    }

    transaction<T>(fn: () => T): T {
        const tx = this.db.transaction(fn)
        return tx()
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                this.migrateLegacySchemaIfNeeded()
                this.createSchema()
                this.seedAlwaysOnTeam()
                this.setUserVersion(SCHEMA_VERSION)
                return
            }

            this.createSchema()
            this.seedAlwaysOnTeam()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        let version = currentVersion

        if (version < 2) {
            this.migrateFromV1ToV2()
            version = 2
            this.setUserVersion(version)
        }

        if (version < 3) {
            this.migrateFromV2ToV3()
            version = 3
            this.setUserVersion(version)
        }

        if (version < 4) {
            this.migrateFromV3ToV4()
            version = 4
            this.setUserVersion(version)
        }

        if (version < 5) {
            this.migrateFromV4ToV5()
            version = 5
            this.setUserVersion(version)
        }

        if (version < 6) {
            this.migrateFromV5ToV6()
            version = 6
            this.setUserVersion(version)
        }

        if (version < 7) {
            this.migrateFromV6ToV7()
            version = 7
            this.setUserVersion(version)
        }

        if (version < 8) {
            this.migrateFromV7ToV8()
            version = 8
            this.setUserVersion(version)
        }

        if (version < 9) {
            this.migrateFromV8ToV9()
            version = 9
            this.setUserVersion(version)
        }

        if (version !== SCHEMA_VERSION) {
            throw this.buildSchemaMismatchError(version)
        }

        this.assertRequiredTablesPresent()
    }

    private createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                namespace TEXT NOT NULL DEFAULT 'default',
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                todos TEXT,
                todos_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0,
                sort_order TEXT,
                parent_session_id TEXT,
                accept_all_messages INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);
            CREATE INDEX IF NOT EXISTS idx_sessions_namespace_sort_order ON sessions(namespace, sort_order, id);
            CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                runner_state TEXT,
                runner_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace);

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                UNIQUE(platform, platform_user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
            CREATE INDEX IF NOT EXISTS idx_users_platform_namespace ON users(platform, namespace);

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, endpoint)
            );
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_namespace ON push_subscriptions(namespace);

            CREATE TABLE IF NOT EXISTS user_preferences (
                namespace TEXT PRIMARY KEY,
                ready_announcements INTEGER NOT NULL DEFAULT 1,
                permission_notifications INTEGER NOT NULL DEFAULT 1,
                error_notifications INTEGER NOT NULL DEFAULT 1,
                team_group_style TEXT NOT NULL DEFAULT 'card',
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_beads (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                linked_at INTEGER NOT NULL,
                linked_by TEXT,
                PRIMARY KEY (session_id, bead_id)
            );
            CREATE INDEX IF NOT EXISTS idx_session_beads_session_id ON session_beads(session_id);

            CREATE TABLE IF NOT EXISTS bead_snapshots (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                fetched_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, bead_id)
            );
            CREATE INDEX IF NOT EXISTS idx_bead_snapshots_session_id ON bead_snapshots(session_id);

            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
                name TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                color TEXT,
                persistent INTEGER NOT NULL DEFAULT 0,
                ttl_seconds INTEGER NOT NULL DEFAULT 3600,
                sort_order TEXT,
                last_active_member_at INTEGER,
                created_by TEXT,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, name)
            );
            CREATE INDEX IF NOT EXISTS idx_teams_namespace ON teams(namespace);

            CREATE TABLE IF NOT EXISTS team_members (
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                joined_at INTEGER NOT NULL,
                PRIMARY KEY (team_id, session_id),
                UNIQUE(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_team_members_session ON team_members(session_id);

            CREATE TABLE IF NOT EXISTS group_sort_orders (
                group_key TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                sort_order TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (namespace, group_key)
            );
        `)
    }

    private seedAlwaysOnTeam(): void {
        const existing = this.db.prepare("SELECT id FROM teams WHERE id = 'always-on'").get()
        if (!existing) {
            this.db.prepare(`
                INSERT INTO teams (id, name, namespace, color, persistent, ttl_seconds, created_at)
                VALUES ('always-on', 'Always On', 'default', '#10B981', 1, 0, @created_at)
            `).run({ created_at: Date.now() })
        }
    }

    private migrateLegacySchemaIfNeeded(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            return
        }

        const hasDaemon = columns.has('daemon_state') || columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') || columns.has('runner_state_version')

        if (hasDaemon && hasRunner) {
            throw new Error('SQLite schema has both daemon_state and runner_state columns in machines; manual cleanup required.')
        }

        if (hasDaemon && !hasRunner) {
            this.migrateFromV1ToV2()
        }
    }

    private migrateFromV1ToV2(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            throw new Error('SQLite schema missing machines table for v1 to v2 migration.')
        }

        const hasDaemon = columns.has('daemon_state') && columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') && columns.has('runner_state_version')

        if (hasRunner && !hasDaemon) {
            return
        }

        if (!hasDaemon) {
            throw new Error('SQLite schema missing daemon_state columns for v1 to v2 migration.')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state TO runner_state')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state_version TO runner_state_version')
            this.db.exec('COMMIT')
            return
        } catch (error) {
            this.db.exec('ROLLBACK')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec(`
                CREATE TABLE machines_new (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata TEXT,
                    metadata_version INTEGER DEFAULT 1,
                    runner_state TEXT,
                    runner_state_version INTEGER DEFAULT 1,
                    active INTEGER DEFAULT 0,
                    active_at INTEGER,
                    seq INTEGER DEFAULT 0
                );
            `)
            this.db.exec(`
                INSERT INTO machines_new (
                    id, namespace, created_at, updated_at,
                    metadata, metadata_version,
                    runner_state, runner_state_version,
                    active, active_at, seq
                )
                SELECT id, namespace, created_at, updated_at,
                       metadata, metadata_version,
                       daemon_state, daemon_state_version,
                       active, active_at, seq
                FROM machines;
            `)
            this.db.exec('DROP TABLE machines')
            this.db.exec('ALTER TABLE machines_new RENAME TO machines')
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace)')
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v1->v2 failed: ${message}`)
        }
    }

    private migrateFromV2ToV3(): void {
        return
    }

    private migrateFromV3ToV4(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_preferences (
                namespace TEXT PRIMARY KEY,
                ready_announcements INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL
            );
        `)
    }

    private migrateFromV4ToV5(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS session_beads (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                linked_at INTEGER NOT NULL,
                linked_by TEXT,
                PRIMARY KEY (session_id, bead_id)
            );
            CREATE INDEX IF NOT EXISTS idx_session_beads_session_id ON session_beads(session_id);

            CREATE TABLE IF NOT EXISTS bead_snapshots (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                fetched_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, bead_id)
            );
            CREATE INDEX IF NOT EXISTS idx_bead_snapshots_session_id ON bead_snapshots(session_id);
        `)
    }

    private migrateFromV5ToV6(): void {
        const sessionColumns = this.getSessionColumnNames()

        try {
            this.db.exec('BEGIN')

            if (!sessionColumns.has('sort_order')) {
                this.db.exec('ALTER TABLE sessions ADD COLUMN sort_order TEXT')
            }

            this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_namespace_sort_order ON sessions(namespace, sort_order, id)')

            const sessionRows = this.db.prepare(
                `SELECT id
                 FROM sessions
                 ORDER BY updated_at DESC, id ASC`
            ).all() as Array<{ id: string }>

            const updateSortOrder = this.db.prepare('UPDATE sessions SET sort_order = ? WHERE id = ?')
            let previousSortOrder: string | null = null

            for (const row of sessionRows) {
                const nextSortOrder = generateKeyBetween(previousSortOrder, null)
                updateSortOrder.run(nextSortOrder, row.id)
                previousSortOrder = nextSortOrder
            }

            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v5->v6 failed: ${message}`)
        }
    }

    private migrateFromV6ToV7(): void {
        const sessionColumns = this.getSessionColumnNames()

        if (!sessionColumns.has('parent_session_id')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN parent_session_id TEXT')
        }

        this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)')
    }

    private migrateFromV7ToV8(): void {
        const columns = this.getUserPreferencesColumnNames()
        try {
            this.db.exec('BEGIN')
            if (!columns.has('permission_notifications')) {
                this.db.exec('ALTER TABLE user_preferences ADD COLUMN permission_notifications INTEGER NOT NULL DEFAULT 1')
            }
            if (!columns.has('error_notifications')) {
                this.db.exec('ALTER TABLE user_preferences ADD COLUMN error_notifications INTEGER NOT NULL DEFAULT 1')
            }
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v7->v8 failed: ${message}`)
        }
    }

    private migrateFromV8ToV9(): void {
        const sessionColumns = this.getSessionColumnNames()
        const userPrefColumns = this.getUserPreferencesColumnNames()

        try {
            this.db.exec('BEGIN')

            // Add accept_all_messages to sessions
            if (!sessionColumns.has('accept_all_messages')) {
                this.db.exec('ALTER TABLE sessions ADD COLUMN accept_all_messages INTEGER NOT NULL DEFAULT 0')
            }

            // Add team_group_style to user_preferences
            if (!userPrefColumns.has('team_group_style')) {
                this.db.exec("ALTER TABLE user_preferences ADD COLUMN team_group_style TEXT NOT NULL DEFAULT 'card'")
            }

            // Create teams table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS teams (
                    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
                    name TEXT NOT NULL,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    color TEXT,
                    persistent INTEGER NOT NULL DEFAULT 0,
                    ttl_seconds INTEGER NOT NULL DEFAULT 3600,
                    sort_order TEXT,
                    last_active_member_at INTEGER,
                    created_by TEXT,
                    created_at INTEGER NOT NULL,
                    UNIQUE(namespace, name)
                );
                CREATE INDEX IF NOT EXISTS idx_teams_namespace ON teams(namespace);
            `)

            // Create team_members table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS team_members (
                    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    joined_at INTEGER NOT NULL,
                    PRIMARY KEY (team_id, session_id),
                    UNIQUE(session_id)
                );
                CREATE INDEX IF NOT EXISTS idx_team_members_session ON team_members(session_id);
            `)

            // Create group_sort_orders table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS group_sort_orders (
                    group_key TEXT NOT NULL,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    sort_order TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (namespace, group_key)
                );
            `)

            this.db.exec('COMMIT')

            // Seed outside of the migration transaction (seedAlwaysOnTeam has its own queries)
            this.seedAlwaysOnTeam()
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v8->v9 failed: ${message}`)
        }
    }

    private getMachineColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(machines)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getSessionColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getUserPreferencesColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(user_preferences)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private assertRequiredTablesPresent(): void {
        const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...REQUIRED_TABLES) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

        if (missing.length > 0) {
            throw new Error(
                `SQLite schema is missing required tables (${missing.join(', ')}). ` +
                'Back up and rebuild the database, or run an offline migration to the expected schema version.'
            )
        }
    }

    private buildSchemaMismatchError(currentVersion: number): Error {
        const location = (this.dbPath === ':memory:' || this.dbPath.startsWith('file::memory:'))
            ? 'in-memory database'
            : this.dbPath
        return new Error(
            `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            'This build does not run compatibility migrations. ' +
            'Back up and rebuild the database, or run an offline migration to the expected schema version.'
        )
    }
}
