import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('Store namespace filtering', () => {
    it('filters sessions by namespace', () => {
        const store = new Store(':memory:')
        const sessionAlpha = store.sessions.getOrCreateSession('tag', { path: '/alpha' }, null, 'alpha')
        const sessionBeta = store.sessions.getOrCreateSession('tag', { path: '/beta' }, null, 'beta')

        const sessionsAlpha = store.sessions.getSessionsByNamespace('alpha')
        const ids = sessionsAlpha.map((session) => session.id)

        expect(ids).toContain(sessionAlpha.id)
        expect(ids).not.toContain(sessionBeta.id)
    })

    it('filters machines by namespace and blocks mismatches', () => {
        const store = new Store(':memory:')
        const machineAlpha = store.machines.getOrCreateMachine('machine-1', { host: 'alpha' }, null, 'alpha')
        store.machines.getOrCreateMachine('machine-2', { host: 'beta' }, null, 'beta')

        const machinesAlpha = store.machines.getMachinesByNamespace('alpha')
        const ids = machinesAlpha.map((machine) => machine.id)

        expect(ids).toContain(machineAlpha.id)
        expect(ids).not.toContain('machine-2')
        expect(() => store.machines.getOrCreateMachine('machine-1', { host: 'beta' }, null, 'beta')).toThrow()
    })

    it('deleteSessionBatch is namespace-guarded', () => {
        const store = new Store(':memory:')
        const alphaSession = store.sessions.getOrCreateSession('alpha-tag', { path: '/alpha' }, null, 'alpha')
        const betaSession = store.sessions.getOrCreateSession('beta-tag', { path: '/beta' }, null, 'beta')

        const deleted = store.sessions.deleteSessionBatch([alphaSession.id, betaSession.id], 'alpha')

        expect(deleted).toBe(1)
        expect(store.sessions.getSession(alphaSession.id)).toBeNull()
        expect(store.sessions.getSession(betaSession.id)).not.toBeNull()
    })
})
