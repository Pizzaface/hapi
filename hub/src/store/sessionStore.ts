import type { Database } from 'bun:sqlite'

import type { StoredSession, VersionedUpdateResult } from './types'
import {
    deleteSessionBatch,
    deleteSession,
    getChildSessions,
    getOrCreateSession,
    getSession,
    getSessionByNamespace,
    getSessions,
    getSessionsByNamespace,
    setParentSessionId,
    setSessionTodos,
    updateSessionAgentState,
    updateSessionMetadata,
    updateSessionSortOrder
} from './sessions'

export class SessionStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, namespace: string, parentSessionId?: string | null): StoredSession {
        return getOrCreateSession(this.db, tag, metadata, agentState, namespace, parentSessionId)
    }

    updateSessionMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number,
        namespace: string,
        options?: { touchUpdatedAt?: boolean }
    ): VersionedUpdateResult<unknown | null> {
        return updateSessionMetadata(this.db, id, metadata, expectedVersion, namespace, options)
    }

    updateSessionAgentState(
        id: string,
        agentState: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        return updateSessionAgentState(this.db, id, agentState, expectedVersion, namespace)
    }

    setSessionTodos(id: string, todos: unknown, todosUpdatedAt: number, namespace: string): boolean {
        return setSessionTodos(this.db, id, todos, todosUpdatedAt, namespace)
    }

    updateSessionSortOrder(id: string, sortOrder: string | null, namespace: string): boolean {
        return updateSessionSortOrder(this.db, id, sortOrder, namespace)
    }

    getSession(id: string): StoredSession | null {
        return getSession(this.db, id)
    }

    getSessionByNamespace(id: string, namespace: string): StoredSession | null {
        return getSessionByNamespace(this.db, id, namespace)
    }

    getSessions(): StoredSession[] {
        return getSessions(this.db)
    }

    getSessionsByNamespace(namespace: string): StoredSession[] {
        return getSessionsByNamespace(this.db, namespace)
    }

    deleteSession(id: string, namespace: string): boolean {
        return deleteSession(this.db, id, namespace)
    }

    deleteSessionBatch(ids: string[], namespace: string): number {
        return deleteSessionBatch(this.db, ids, namespace)
    }

    setParentSessionId(id: string, parentSessionId: string | null, namespace: string): boolean {
        return setParentSessionId(this.db, id, parentSessionId, namespace)
    }

    getChildSessions(parentSessionId: string, namespace: string): StoredSession[] {
        return getChildSessions(this.db, parentSessionId, namespace)
    }
}
