import type { Database } from 'bun:sqlite'

import type { StoredTeam } from './types'
import type { CreateTeamOptions, StoredGroupSortOrder, UpdateTeamFields } from './teams'
import {
    addMember,
    areInSameTeam,
    createTeam,
    deleteTeam,
    getExpiredTemporaryTeams,
    getGroupSortOrders,
    getTeam,
    getTeamForSession,
    getTeamMembers,
    getTeamsByNamespace,
    removeMember,
    updateLastActiveMemberAt,
    updateTeam,
    upsertGroupSortOrder
} from './teams'

export class TeamStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    createTeam(name: string, namespace: string, opts?: CreateTeamOptions): StoredTeam {
        return createTeam(this.db, name, namespace, opts)
    }

    getTeam(id: string, namespace: string): StoredTeam | null {
        return getTeam(this.db, id, namespace)
    }

    getTeamsByNamespace(namespace: string): StoredTeam[] {
        return getTeamsByNamespace(this.db, namespace)
    }

    updateTeam(id: string, namespace: string, fields: UpdateTeamFields): boolean {
        return updateTeam(this.db, id, namespace, fields)
    }

    deleteTeam(id: string, namespace: string): boolean {
        return deleteTeam(this.db, id, namespace)
    }

    addMember(teamId: string, sessionId: string, namespace: string): boolean {
        return addMember(this.db, teamId, sessionId, namespace)
    }

    removeMember(teamId: string, sessionId: string, namespace: string): boolean {
        return removeMember(this.db, teamId, sessionId, namespace)
    }

    getTeamMembers(teamId: string, namespace: string): string[] {
        return getTeamMembers(this.db, teamId, namespace)
    }

    getTeamForSession(sessionId: string, namespace: string): StoredTeam | null {
        return getTeamForSession(this.db, sessionId, namespace)
    }

    areInSameTeam(sessionIdA: string, sessionIdB: string, namespace: string): boolean {
        return areInSameTeam(this.db, sessionIdA, sessionIdB, namespace)
    }

    updateLastActiveMemberAt(teamId: string, timestamp: number): boolean {
        return updateLastActiveMemberAt(this.db, teamId, timestamp)
    }

    getExpiredTemporaryTeams(now: number): StoredTeam[] {
        return getExpiredTemporaryTeams(this.db, now)
    }

    upsertGroupSortOrder(groupKey: string, namespace: string, sortOrder: string): void {
        upsertGroupSortOrder(this.db, groupKey, namespace, sortOrder)
    }

    getGroupSortOrders(namespace: string): StoredGroupSortOrder[] {
        return getGroupSortOrders(this.db, namespace)
    }
}
