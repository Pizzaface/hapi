import type { Database } from 'bun:sqlite'
import type { StoredBeadSnapshot, StoredSessionBead } from './types'
import { safeJsonParse } from './json'

const MAX_BEADS_PER_SESSION = 10
const MAX_BEAD_ID_LENGTH = 128

type DbSessionBeadRow = {
    session_id: string
    bead_id: string
    linked_at: number
    linked_by: string | null
}

type DbBeadSnapshotRow = {
    session_id: string
    bead_id: string
    data_json: string
    fetched_at: number
}

function toStoredSessionBead(row: DbSessionBeadRow): StoredSessionBead {
    return {
        sessionId: row.session_id,
        beadId: row.bead_id,
        linkedAt: row.linked_at,
        linkedBy: row.linked_by
    }
}

function toStoredBeadSnapshot(row: DbBeadSnapshotRow): StoredBeadSnapshot {
    return {
        sessionId: row.session_id,
        beadId: row.bead_id,
        data: safeJsonParse(row.data_json),
        fetchedAt: row.fetched_at
    }
}

function normalizeBeadId(beadId: string): string {
    const normalized = beadId.trim()
    if (!normalized) {
        throw new Error('Bead ID is required')
    }
    if (normalized.length > MAX_BEAD_ID_LENGTH) {
        throw new Error(`Bead ID exceeds max length (${MAX_BEAD_ID_LENGTH})`)
    }
    return normalized
}

export class SessionBeadStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    linkBead(sessionId: string, beadId: string, linkedBy?: string | null): boolean {
        const normalizedBeadId = normalizeBeadId(beadId)

        const existing = this.db.prepare(
            'SELECT 1 FROM session_beads WHERE session_id = ? AND bead_id = ? LIMIT 1'
        ).get(sessionId, normalizedBeadId) as { 1: number } | undefined
        if (existing) {
            return false
        }

        const row = this.db.prepare(
            'SELECT COUNT(*) AS count FROM session_beads WHERE session_id = ?'
        ).get(sessionId) as { count: number }
        if (row.count >= MAX_BEADS_PER_SESSION) {
            throw new Error('Session bead limit reached (max 10)')
        }

        const result = this.db.prepare(`
            INSERT INTO session_beads (session_id, bead_id, linked_at, linked_by)
            VALUES (@session_id, @bead_id, @linked_at, @linked_by)
        `).run({
            session_id: sessionId,
            bead_id: normalizedBeadId,
            linked_at: Date.now(),
            linked_by: linkedBy ?? null
        })

        return result.changes === 1
    }

    unlinkBead(sessionId: string, beadId: string): boolean {
        const normalizedBeadId = normalizeBeadId(beadId)

        const tx = this.db.transaction(() => {
            const linkDelete = this.db.prepare(
                'DELETE FROM session_beads WHERE session_id = ? AND bead_id = ?'
            ).run(sessionId, normalizedBeadId)
            this.db.prepare(
                'DELETE FROM bead_snapshots WHERE session_id = ? AND bead_id = ?'
            ).run(sessionId, normalizedBeadId)
            return linkDelete.changes > 0
        })

        return tx()
    }

    getBeadIds(sessionId: string): string[] {
        const rows = this.db.prepare(`
            SELECT bead_id
            FROM session_beads
            WHERE session_id = ?
            ORDER BY linked_at ASC
        `).all(sessionId) as Array<{ bead_id: string }>
        return rows.map((row) => row.bead_id)
    }

    getSessionLinks(sessionId: string): StoredSessionBead[] {
        const rows = this.db.prepare(`
            SELECT session_id, bead_id, linked_at, linked_by
            FROM session_beads
            WHERE session_id = ?
            ORDER BY linked_at ASC
        `).all(sessionId) as DbSessionBeadRow[]

        return rows.map(toStoredSessionBead)
    }

    getAllSessionIdsWithLinks(): string[] {
        const rows = this.db.prepare(`
            SELECT DISTINCT session_id
            FROM session_beads
            ORDER BY session_id ASC
        `).all() as Array<{ session_id: string }>

        return rows.map((row) => row.session_id)
    }

    reassignSession(oldSessionId: string, newSessionId: string): void {
        if (oldSessionId === newSessionId) {
            return
        }

        const tx = this.db.transaction(() => {
            this.db.prepare(`
                INSERT OR IGNORE INTO session_beads (session_id, bead_id, linked_at, linked_by)
                SELECT @new_session_id, bead_id, linked_at, linked_by
                FROM session_beads
                WHERE session_id = @old_session_id
            `).run({
                new_session_id: newSessionId,
                old_session_id: oldSessionId
            })

            this.db.prepare(`
                INSERT OR IGNORE INTO bead_snapshots (session_id, bead_id, data_json, fetched_at)
                SELECT @new_session_id, bead_id, data_json, fetched_at
                FROM bead_snapshots
                WHERE session_id = @old_session_id
            `).run({
                new_session_id: newSessionId,
                old_session_id: oldSessionId
            })

            this.db.prepare('DELETE FROM session_beads WHERE session_id = ?').run(oldSessionId)
            this.db.prepare('DELETE FROM bead_snapshots WHERE session_id = ?').run(oldSessionId)
        })

        tx()
    }

    saveSnapshot(sessionId: string, beadId: string, data: unknown, fetchedAt: number = Date.now()): boolean {
        const normalizedBeadId = normalizeBeadId(beadId)
        const dataJson = JSON.stringify(data)

        if (dataJson === undefined) {
            return false
        }

        const existing = this.db.prepare(`
            SELECT data_json
            FROM bead_snapshots
            WHERE session_id = ? AND bead_id = ?
        `).get(sessionId, normalizedBeadId) as { data_json: string } | undefined

        if (existing && existing.data_json === dataJson) {
            this.db.prepare(`
                UPDATE bead_snapshots
                SET fetched_at = @fetched_at
                WHERE session_id = @session_id AND bead_id = @bead_id
            `).run({
                fetched_at: fetchedAt,
                session_id: sessionId,
                bead_id: normalizedBeadId
            })
            return false
        }

        this.db.prepare(`
            INSERT INTO bead_snapshots (session_id, bead_id, data_json, fetched_at)
            VALUES (@session_id, @bead_id, @data_json, @fetched_at)
            ON CONFLICT(session_id, bead_id) DO UPDATE SET
                data_json = excluded.data_json,
                fetched_at = excluded.fetched_at
        `).run({
            session_id: sessionId,
            bead_id: normalizedBeadId,
            data_json: dataJson,
            fetched_at: fetchedAt
        })

        return true
    }

    getSnapshot(sessionId: string, beadId: string): StoredBeadSnapshot | null {
        const normalizedBeadId = normalizeBeadId(beadId)
        const row = this.db.prepare(`
            SELECT session_id, bead_id, data_json, fetched_at
            FROM bead_snapshots
            WHERE session_id = ? AND bead_id = ?
        `).get(sessionId, normalizedBeadId) as DbBeadSnapshotRow | undefined

        return row ? toStoredBeadSnapshot(row) : null
    }

    getSnapshots(sessionId: string): StoredBeadSnapshot[] {
        const rows = this.db.prepare(`
            SELECT session_id, bead_id, data_json, fetched_at
            FROM bead_snapshots
            WHERE session_id = ?
            ORDER BY fetched_at DESC, bead_id ASC
        `).all(sessionId) as DbBeadSnapshotRow[]

        return rows.map(toStoredBeadSnapshot)
    }

    deleteSnapshot(sessionId: string, beadId: string): boolean {
        const normalizedBeadId = normalizeBeadId(beadId)
        const result = this.db.prepare(
            'DELETE FROM bead_snapshots WHERE session_id = ? AND bead_id = ?'
        ).run(sessionId, normalizedBeadId)

        return result.changes > 0
    }

    deleteSession(sessionId: string): void {
        const tx = this.db.transaction(() => {
            this.db.prepare('DELETE FROM session_beads WHERE session_id = ?').run(sessionId)
            this.db.prepare('DELETE FROM bead_snapshots WHERE session_id = ?').run(sessionId)
        })

        tx()
    }

    deleteSessionBatch(sessionIds: string[]): void {
        if (sessionIds.length === 0) {
            return
        }

        const placeholders = sessionIds.map(() => '?').join(', ')
        this.db.prepare(
            `DELETE FROM session_beads
             WHERE session_id IN (${placeholders})`
        ).run(...sessionIds)
        this.db.prepare(
            `DELETE FROM bead_snapshots
             WHERE session_id IN (${placeholders})`
        ).run(...sessionIds)
    }
}
