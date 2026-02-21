import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Store } from './index'

describe('Store sessions/machines/messages', () => {
    it('returns version-mismatch payloads for stale session and machine updates', () => {
        const store = new Store(':memory:')

        const session = store.sessions.getOrCreateSession('session-tag', { path: '/repo' }, null, 'alpha')
        const sessionUpdated = store.sessions.updateSessionMetadata(
            session.id,
            { path: '/repo', name: 'fresh' },
            session.metadataVersion,
            'alpha'
        )
        expect(sessionUpdated.result).toBe('success')
        if (sessionUpdated.result !== 'success') {
            throw new Error('Expected initial session update to succeed')
        }

        const staleSessionUpdate = store.sessions.updateSessionMetadata(
            session.id,
            { path: '/repo', name: 'stale' },
            session.metadataVersion,
            'alpha'
        )
        expect(staleSessionUpdate.result).toBe('version-mismatch')
        if (staleSessionUpdate.result !== 'version-mismatch') {
            throw new Error('Expected session version mismatch')
        }
        expect(staleSessionUpdate.version).toBe(sessionUpdated.version)
        expect(staleSessionUpdate.value).toEqual({ path: '/repo', name: 'fresh' })

        const machine = store.machines.getOrCreateMachine('machine-1', { host: 'alpha' }, { status: 'idle' }, 'alpha')
        const machineUpdated = store.machines.updateMachineRunnerState(
            machine.id,
            { status: 'running' },
            machine.runnerStateVersion,
            'alpha'
        )
        expect(machineUpdated.result).toBe('success')
        if (machineUpdated.result !== 'success') {
            throw new Error('Expected initial machine update to succeed')
        }

        const staleMachineUpdate = store.machines.updateMachineRunnerState(
            machine.id,
            { status: 'stale' },
            machine.runnerStateVersion,
            'alpha'
        )
        expect(staleMachineUpdate.result).toBe('version-mismatch')
        if (staleMachineUpdate.result !== 'version-mismatch') {
            throw new Error('Expected machine version mismatch')
        }
        expect(staleMachineUpdate.version).toBe(machineUpdated.version)
        expect(staleMachineUpdate.value).toEqual({ status: 'running' })
    })

    it('isolates sessions and machines by namespace', () => {
        const store = new Store(':memory:')

        const alphaSession = store.sessions.getOrCreateSession('shared-tag', { path: '/alpha' }, null, 'alpha')
        const betaSession = store.sessions.getOrCreateSession('shared-tag', { path: '/beta' }, null, 'beta')

        expect(alphaSession.id).not.toBe(betaSession.id)
        expect(store.sessions.getSessionByNamespace(alphaSession.id, 'alpha')?.id).toBe(alphaSession.id)
        expect(store.sessions.getSessionByNamespace(alphaSession.id, 'beta')).toBeNull()

        const alphaSessions = store.sessions.getSessionsByNamespace('alpha').map((session) => session.id)
        expect(alphaSessions).toContain(alphaSession.id)
        expect(alphaSessions).not.toContain(betaSession.id)

        const wrongNamespaceUpdate = store.sessions.updateSessionMetadata(
            alphaSession.id,
            { path: '/alpha', name: 'blocked' },
            alphaSession.metadataVersion,
            'beta'
        )
        expect(wrongNamespaceUpdate.result).toBe('error')

        const alphaMachine = store.machines.getOrCreateMachine('machine-1', { host: 'alpha' }, null, 'alpha')
        store.machines.getOrCreateMachine('machine-2', { host: 'beta' }, null, 'beta')
        expect(() => store.machines.getOrCreateMachine('machine-1', { host: 'beta' }, null, 'beta')).toThrow(
            'Machine namespace mismatch'
        )

        const alphaMachines = store.machines.getMachinesByNamespace('alpha').map((machine) => machine.id)
        expect(alphaMachines).toContain(alphaMachine.id)
        expect(alphaMachines).not.toContain('machine-2')
    })

    it('guards todos updates by timestamp', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('todos-tag', { path: '/repo' }, null, 'alpha')

        const firstTimestamp = 1_000
        const staleTimestamp = 900
        const sameTimestamp = 1_000
        const newerTimestamp = 1_100

        expect(store.sessions.setSessionTodos(session.id, [{ id: 'first' }], firstTimestamp, 'alpha')).toBe(true)
        const afterFirst = store.sessions.getSession(session.id)
        if (!afterFirst) {
            throw new Error('Session missing after initial todos update')
        }

        expect(store.sessions.setSessionTodos(session.id, [{ id: 'stale' }], staleTimestamp, 'alpha')).toBe(false)
        expect(store.sessions.setSessionTodos(session.id, [{ id: 'same' }], sameTimestamp, 'alpha')).toBe(false)

        const unchanged = store.sessions.getSession(session.id)
        if (!unchanged) {
            throw new Error('Session missing after stale todos update')
        }
        expect(unchanged.todos).toEqual([{ id: 'first' }])
        expect(unchanged.todosUpdatedAt).toBe(firstTimestamp)
        expect(unchanged.seq).toBe(afterFirst.seq)

        expect(store.sessions.setSessionTodos(session.id, [{ id: 'newer' }], newerTimestamp, 'alpha')).toBe(true)

        const latest = store.sessions.getSession(session.id)
        if (!latest) {
            throw new Error('Session missing after latest todos update')
        }
        expect(latest.todos).toEqual([{ id: 'newer' }])
        expect(latest.todosUpdatedAt).toBe(newerTimestamp)
        expect(latest.seq).toBe(afterFirst.seq + 1)
    })

    it('deduplicates message localId and clamps list limits', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('message-tag', { path: '/repo' }, null, 'alpha')

        const first = store.messages.addMessage(session.id, { body: 'first' }, 'local-1')
        const duplicate = store.messages.addMessage(session.id, { body: 'changed' }, 'local-1')

        expect(duplicate.id).toBe(first.id)
        expect(duplicate.seq).toBe(first.seq)
        expect(duplicate.content).toEqual({ body: 'first' })

        for (let i = 0; i < 205; i += 1) {
            store.messages.addMessage(session.id, { idx: i })
        }

        const clampedMax = store.messages.getMessages(session.id, 999)
        expect(clampedMax).toHaveLength(200)
        expect(clampedMax[0]?.seq).toBe(7)
        expect(clampedMax[clampedMax.length - 1]?.seq).toBe(206)

        const clampedMin = store.messages.getMessages(session.id, 0)
        expect(clampedMin).toHaveLength(1)
        expect(clampedMin[0]?.seq).toBe(206)
    })

    it('merges session messages and nulls collided localIds', () => {
        const store = new Store(':memory:')
        const fromSession = store.sessions.getOrCreateSession('from-tag', { path: '/from' }, null, 'alpha')
        const toSession = store.sessions.getOrCreateSession('to-tag', { path: '/to' }, null, 'alpha')

        store.messages.addMessage(toSession.id, { label: 'to-collide' }, 'same-local-id')
        store.messages.addMessage(toSession.id, { label: 'to-unique' }, 'to-only')
        store.messages.addMessage(fromSession.id, { label: 'from-collide' }, 'same-local-id')
        store.messages.addMessage(fromSession.id, { label: 'from-unique' }, 'from-only')

        const merge = store.messages.mergeSessionMessages(fromSession.id, toSession.id)
        expect(merge).toEqual({ moved: 2, oldMaxSeq: 2, newMaxSeq: 2 })

        expect(store.messages.getMessages(fromSession.id, 50)).toHaveLength(0)

        const merged = store.messages.getMessages(toSession.id, 50)
        expect(merged.map((message) => message.seq)).toEqual([1, 2, 3, 4])

        const localIdByLabel = new Map(
            merged.map((message) => [
                (message.content as { label?: string })?.label,
                message.localId
            ])
        )

        expect(localIdByLabel.get('to-collide')).toBe('same-local-id')
        expect(localIdByLabel.get('from-collide')).toBeNull()
        expect(localIdByLabel.get('from-unique')).toBe('from-only')
    })

    it('creates new sessions at top of manual sort order', () => {
        const store = new Store(':memory:')
        const first = store.sessions.getOrCreateSession('first', { path: '/repo', host: 'host' }, null, 'alpha')
        const second = store.sessions.getOrCreateSession('second', { path: '/repo', host: 'host' }, null, 'alpha')

        expect(first.sortOrder).not.toBeNull()
        expect(second.sortOrder).not.toBeNull()
        if (!first.sortOrder || !second.sortOrder) {
            throw new Error('Expected sortOrder to be assigned')
        }

        expect(second.sortOrder < first.sortOrder).toBe(true)
        expect(store.sessions.getSessionsByNamespace('alpha').map((session) => session.id)).toEqual([second.id, first.id])
    })

    it('updates session sort order without bumping updatedAt', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('order-tag', { path: '/repo', host: 'host' }, null, 'alpha')
        if (!session.sortOrder) {
            throw new Error('Expected sortOrder to be set on session creation')
        }

        const newSortOrder = `${session.sortOrder}V`
        const changed = store.sessions.updateSessionSortOrder(session.id, newSortOrder, 'alpha')
        expect(changed).toBe(true)

        const updated = store.sessions.getSession(session.id)
        expect(updated?.sortOrder).toBe(newSortOrder)
        expect(updated?.updatedAt).toBe(session.updatedAt)
    })

    it('migrates v6 to v8 and adds parent_session_id, permission_notifications, and error_notifications columns', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-store-migration-v7-'))
        const dbPath = join(dir, 'store.sqlite')

        const seedDb = new Database(dbPath, { create: true, readwrite: true, strict: true })
        seedDb.exec(`
            CREATE TABLE sessions (
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
                sort_order TEXT
            );
            CREATE INDEX idx_sessions_tag ON sessions(tag);
            CREATE INDEX idx_sessions_tag_namespace ON sessions(tag, namespace);
            CREATE INDEX idx_sessions_namespace_sort_order ON sessions(namespace, sort_order, id);

            CREATE TABLE machines (
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
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT
            );
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL
            );
            CREATE TABLE push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE user_preferences (
                namespace TEXT PRIMARY KEY,
                ready_announcements INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE session_beads (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                linked_at INTEGER NOT NULL,
                linked_by TEXT,
                PRIMARY KEY (session_id, bead_id)
            );
            CREATE TABLE bead_snapshots (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                fetched_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, bead_id)
            );
            INSERT INTO user_preferences (namespace, ready_announcements, updated_at) VALUES ('default', 1, 0);
            PRAGMA user_version = 6;
        `)
        seedDb.close()

        const store = new Store(dbPath)
        const prefs = store.userPreferences.get('default')
        expect(prefs.permissionNotifications).toBe(true)
        expect(prefs.errorNotifications).toBe(true)
        expect(prefs.readyAnnouncements).toBe(true)

        const verifyDb = new Database(dbPath, { create: false, readwrite: false, strict: true })
        const columns = verifyDb.prepare('PRAGMA table_info(user_preferences)').all() as Array<{ name: string }>
        const versionRow = verifyDb.prepare('PRAGMA user_version').get() as { user_version: number }
        verifyDb.close()

        const columnNames = columns.map((c) => c.name)
        expect(columnNames).toContain('permission_notifications')
        expect(columnNames).toContain('error_notifications')
        expect(versionRow.user_version).toBe(8)

        rmSync(dir, { recursive: true, force: true })
    })

    it('fresh DB includes permission_notifications and error_notifications with defaults', () => {
        const store = new Store(':memory:')
        const prefs = store.userPreferences.get('default')
        expect(prefs.readyAnnouncements).toBe(true)
        expect(prefs.permissionNotifications).toBe(true)
        expect(prefs.errorNotifications).toBe(true)
    })

    it('UserPreferencesStore.update sets permissionNotifications correctly', () => {
        const store = new Store(':memory:')
        store.userPreferences.update('default', { permissionNotifications: false })
        const prefs = store.userPreferences.get('default')
        expect(prefs.permissionNotifications).toBe(false)
        expect(prefs.readyAnnouncements).toBe(true)
    })

    it('migrates v5 sessions to v6 and backfills sort_order by updated_at desc', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-store-migration-'))
        const dbPath = join(dir, 'store.sqlite')

        const seedDb = new Database(dbPath, { create: true, readwrite: true, strict: true })
        seedDb.exec(`
            CREATE TABLE sessions (
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
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX idx_sessions_tag ON sessions(tag);
            CREATE INDEX idx_sessions_tag_namespace ON sessions(tag, namespace);

            CREATE TABLE machines (
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
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT
            );
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL
            );
            CREATE TABLE push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE user_preferences (
                namespace TEXT PRIMARY KEY,
                ready_announcements INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE session_beads (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                linked_at INTEGER NOT NULL,
                linked_by TEXT,
                PRIMARY KEY (session_id, bead_id)
            );
            CREATE TABLE bead_snapshots (
                session_id TEXT NOT NULL,
                bead_id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                fetched_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, bead_id)
            );
            PRAGMA user_version = 5;
        `)

        const insertSession = seedDb.prepare(`
            INSERT INTO sessions (
                id, tag, namespace, machine_id, created_at, updated_at,
                metadata, metadata_version, agent_state, agent_state_version,
                todos, todos_updated_at, active, active_at, seq
            ) VALUES (
                @id, @tag, @namespace, NULL, @created_at, @updated_at,
                @metadata, 1, NULL, 1,
                NULL, NULL, 0, NULL, 0
            )
        `)

        insertSession.run({
            id: 'session-oldest',
            tag: 'oldest',
            namespace: 'alpha',
            created_at: 1_000,
            updated_at: 1_000,
            metadata: JSON.stringify({ path: '/repo', host: 'host' })
        })
        insertSession.run({
            id: 'session-middle',
            tag: 'middle',
            namespace: 'alpha',
            created_at: 2_000,
            updated_at: 2_000,
            metadata: JSON.stringify({ path: '/repo', host: 'host' })
        })
        insertSession.run({
            id: 'session-newest',
            tag: 'newest',
            namespace: 'alpha',
            created_at: 3_000,
            updated_at: 3_000,
            metadata: JSON.stringify({ path: '/repo', host: 'host' })
        })
        seedDb.close()

        const store = new Store(dbPath)
        const migrated = store.sessions.getSessionsByNamespace('alpha')
        expect(migrated.map((session) => session.id)).toEqual([
            'session-newest',
            'session-middle',
            'session-oldest'
        ])
        expect(migrated.every((session) => typeof session.sortOrder === 'string' && session.sortOrder.length > 0)).toBe(true)

        const verifyDb = new Database(dbPath, { create: false, readwrite: true, strict: true })
        const columns = verifyDb.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        const indexes = verifyDb.prepare('PRAGMA index_list(sessions)').all() as Array<{ name: string }>
        const versionRow = verifyDb.prepare('PRAGMA user_version').get() as { user_version: number }
        verifyDb.close()

        expect(columns.some((column) => column.name === 'sort_order')).toBe(true)
        expect(indexes.some((index) => index.name === 'idx_sessions_namespace_sort_order')).toBe(true)
        expect(versionRow.user_version).toBe(8)
        expect(columns.some((column) => column.name === 'parent_session_id')).toBe(true)
        expect(indexes.some((index) => index.name === 'idx_sessions_parent')).toBe(true)

        rmSync(dir, { recursive: true, force: true })
    })

    it('stores and retrieves parent_session_id on session creation', () => {
        const store = new Store(':memory:')

        const parent = store.sessions.getOrCreateSession('parent-tag', { path: '/repo', host: 'host' }, null, 'alpha')
        const child = store.sessions.getOrCreateSession('child-tag', { path: '/repo', host: 'host' }, null, 'alpha', parent.id)

        expect(parent.parentSessionId).toBeNull()
        expect(child.parentSessionId).toBe(parent.id)

        const childFromDb = store.sessions.getSession(child.id)
        expect(childFromDb?.parentSessionId).toBe(parent.id)
    })

    it('finds child sessions by parent_session_id', () => {
        const store = new Store(':memory:')

        const parent = store.sessions.getOrCreateSession('parent-tag', { path: '/repo', host: 'host' }, null, 'alpha')
        const child1 = store.sessions.getOrCreateSession('child-1', { path: '/repo', host: 'host' }, null, 'alpha', parent.id)
        const child2 = store.sessions.getOrCreateSession('child-2', { path: '/repo', host: 'host' }, null, 'alpha', parent.id)
        store.sessions.getOrCreateSession('unrelated', { path: '/repo', host: 'host' }, null, 'alpha')

        const children = store.sessions.getChildSessions(parent.id, 'alpha')
        expect(children.map((s) => s.id).sort()).toEqual([child1.id, child2.id].sort())
    })

    it('setParentSessionId updates existing session', () => {
        const store = new Store(':memory:')

        const parent = store.sessions.getOrCreateSession('parent-tag', { path: '/repo', host: 'host' }, null, 'alpha')
        const child = store.sessions.getOrCreateSession('child-tag', { path: '/repo', host: 'host' }, null, 'alpha')

        expect(child.parentSessionId).toBeNull()

        const updated = store.sessions.setParentSessionId(child.id, parent.id, 'alpha')
        expect(updated).toBe(true)

        const childFromDb = store.sessions.getSession(child.id)
        expect(childFromDb?.parentSessionId).toBe(parent.id)
    })
})
