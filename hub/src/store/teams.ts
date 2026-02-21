import type { Database } from 'bun:sqlite'

import type { StoredTeam } from './types'

type DbTeamRow = {
    id: string
    name: string
    namespace: string
    color: string | null
    persistent: number
    ttl_seconds: number
    sort_order: string | null
    last_active_member_at: number | null
    created_by: string | null
    created_at: number
}

function toStoredTeam(row: DbTeamRow): StoredTeam {
    return {
        id: row.id,
        name: row.name,
        namespace: row.namespace,
        color: row.color,
        persistent: row.persistent === 1,
        ttlSeconds: row.ttl_seconds,
        sortOrder: row.sort_order,
        lastActiveMemberAt: row.last_active_member_at,
        createdBy: row.created_by,
        createdAt: row.created_at
    }
}

const ALWAYS_ON_TEAM_ID = 'always-on'

export type CreateTeamOptions = {
    id?: string
    color?: string | null
    persistent?: boolean
    ttlSeconds?: number
    sortOrder?: string | null
    createdBy?: string | null
}

export type UpdateTeamFields = {
    name?: string
    color?: string | null
    sortOrder?: string | null
    ttlSeconds?: number
}

export function createTeam(
    db: Database,
    name: string,
    namespace: string,
    opts?: CreateTeamOptions
): StoredTeam {
    const now = Date.now()
    const id = opts?.id

    if (id !== undefined) {
        db.prepare(`
            INSERT INTO teams (id, name, namespace, color, persistent, ttl_seconds, sort_order, created_by, created_at)
            VALUES (@id, @name, @namespace, @color, @persistent, @ttl_seconds, @sort_order, @created_by, @created_at)
        `).run({
            id,
            name,
            namespace,
            color: opts?.color ?? null,
            persistent: opts?.persistent ? 1 : 0,
            ttl_seconds: opts?.ttlSeconds ?? 3600,
            sort_order: opts?.sortOrder ?? null,
            created_by: opts?.createdBy ?? null,
            created_at: now
        })
    } else {
        db.prepare(`
            INSERT INTO teams (name, namespace, color, persistent, ttl_seconds, sort_order, created_by, created_at)
            VALUES (@name, @namespace, @color, @persistent, @ttl_seconds, @sort_order, @created_by, @created_at)
        `).run({
            name,
            namespace,
            color: opts?.color ?? null,
            persistent: opts?.persistent ? 1 : 0,
            ttl_seconds: opts?.ttlSeconds ?? 3600,
            sort_order: opts?.sortOrder ?? null,
            created_by: opts?.createdBy ?? null,
            created_at: now
        })
    }

    // Re-query to get the team (with generated id if applicable)
    const row = db.prepare(
        'SELECT * FROM teams WHERE name = ? AND namespace = ?'
    ).get(name, namespace) as DbTeamRow | undefined
    if (!row) throw new Error('Failed to create team')
    return toStoredTeam(row)
}

export function getTeam(db: Database, id: string, namespace: string): StoredTeam | null {
    const row = db.prepare(
        'SELECT * FROM teams WHERE id = ? AND namespace = ?'
    ).get(id, namespace) as DbTeamRow | undefined
    return row ? toStoredTeam(row) : null
}

export function getTeamsByNamespace(db: Database, namespace: string): StoredTeam[] {
    const rows = db.prepare(
        `SELECT * FROM teams WHERE namespace = ?
         ORDER BY sort_order IS NULL ASC, sort_order ASC, created_at ASC`
    ).all(namespace) as DbTeamRow[]
    return rows.map(toStoredTeam)
}

export function updateTeam(
    db: Database,
    id: string,
    namespace: string,
    fields: UpdateTeamFields
): boolean {
    // Protect always-on team from rename
    if (id === ALWAYS_ON_TEAM_ID && fields.name !== undefined) {
        throw new Error('Cannot rename the always-on team')
    }

    // Read current, apply updates, write back
    const current = db.prepare(
        'SELECT * FROM teams WHERE id = ? AND namespace = ?'
    ).get(id, namespace) as DbTeamRow | undefined
    if (!current) return false

    const result = db.prepare(`
        UPDATE teams
        SET name = @name, color = @color, sort_order = @sort_order, ttl_seconds = @ttl_seconds
        WHERE id = @id AND namespace = @namespace
    `).run({
        id,
        namespace,
        name: fields.name ?? current.name,
        color: fields.color !== undefined ? fields.color : current.color,
        sort_order: fields.sortOrder !== undefined ? fields.sortOrder : current.sort_order,
        ttl_seconds: fields.ttlSeconds ?? current.ttl_seconds
    })

    return result.changes === 1
}

export function deleteTeam(db: Database, id: string, namespace: string): boolean {
    if (id === ALWAYS_ON_TEAM_ID) {
        throw new Error('Cannot delete the always-on team')
    }

    const result = db.prepare(
        'DELETE FROM teams WHERE id = ? AND namespace = ?'
    ).run(id, namespace)
    return result.changes > 0
}

export function addMember(
    db: Database,
    teamId: string,
    sessionId: string,
    namespace: string
): boolean {
    // Verify team exists in namespace
    const team = db.prepare(
        'SELECT id FROM teams WHERE id = ? AND namespace = ?'
    ).get(teamId, namespace) as { id: string } | undefined
    if (!team) return false

    try {
        db.prepare(`
            INSERT INTO team_members (team_id, session_id, joined_at)
            VALUES (@team_id, @session_id, @joined_at)
        `).run({
            team_id: teamId,
            session_id: sessionId,
            joined_at: Date.now()
        })
        return true
    } catch {
        // UNIQUE constraint violation (session already in a team) or FK failure
        return false
    }
}

export function removeMember(
    db: Database,
    teamId: string,
    sessionId: string,
    namespace: string
): boolean {
    // Verify team exists in namespace
    const team = db.prepare(
        'SELECT id FROM teams WHERE id = ? AND namespace = ?'
    ).get(teamId, namespace) as { id: string } | undefined
    if (!team) return false

    const result = db.prepare(
        'DELETE FROM team_members WHERE team_id = ? AND session_id = ?'
    ).run(teamId, sessionId)
    return result.changes > 0
}

export function getTeamMembers(
    db: Database,
    teamId: string,
    namespace: string
): string[] {
    // Verify team exists in namespace
    const team = db.prepare(
        'SELECT id FROM teams WHERE id = ? AND namespace = ?'
    ).get(teamId, namespace) as { id: string } | undefined
    if (!team) return []

    const rows = db.prepare(
        'SELECT session_id FROM team_members WHERE team_id = ? ORDER BY joined_at ASC'
    ).all(teamId) as Array<{ session_id: string }>
    return rows.map((row) => row.session_id)
}

export function getTeamForSession(
    db: Database,
    sessionId: string,
    namespace: string
): StoredTeam | null {
    const row = db.prepare(`
        SELECT t.* FROM teams t
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.session_id = ? AND t.namespace = ?
    `).get(sessionId, namespace) as DbTeamRow | undefined
    return row ? toStoredTeam(row) : null
}

export function areInSameTeam(
    db: Database,
    sessionIdA: string,
    sessionIdB: string,
    namespace: string
): boolean {
    const row = db.prepare(`
        SELECT a.team_id AS tid FROM team_members a
        JOIN team_members b ON a.team_id = b.team_id
        JOIN teams t ON t.id = a.team_id
        WHERE a.session_id = ? AND b.session_id = ? AND t.namespace = ?
        LIMIT 1
    `).get(sessionIdA, sessionIdB, namespace) as { tid: string } | null
    return row !== null
}

export function updateLastActiveMemberAt(
    db: Database,
    teamId: string,
    timestamp: number
): boolean {
    const result = db.prepare(
        'UPDATE teams SET last_active_member_at = ? WHERE id = ?'
    ).run(timestamp, teamId)
    return result.changes === 1
}

export function getExpiredTemporaryTeams(db: Database, now: number): StoredTeam[] {
    const rows = db.prepare(`
        SELECT * FROM teams
        WHERE persistent = 0
          AND last_active_member_at IS NOT NULL
          AND (? - last_active_member_at) > (ttl_seconds * 1000)
    `).all(now) as DbTeamRow[]
    return rows.map(toStoredTeam)
}
