import { describe, expect, it } from 'bun:test'
import { Store } from './index'

function makeStore(): Store {
    return new Store(':memory:')
}

describe('SessionBeadStore', () => {
    it('linkBead creates session_beads row', () => {
        const store = makeStore()

        const inserted = store.sessionBeads.linkBead('session-1', 'hapi-6uf', 'agent')
        const ids = store.sessionBeads.getBeadIds('session-1')

        expect(inserted).toBe(true)
        expect(ids).toEqual(['hapi-6uf'])
    })

    it('unlinkBead removes row', () => {
        const store = makeStore()
        store.sessionBeads.linkBead('session-1', 'hapi-6uf')

        const removed = store.sessionBeads.unlinkBead('session-1', 'hapi-6uf')

        expect(removed).toBe(true)
        expect(store.sessionBeads.getBeadIds('session-1')).toEqual([])
    })

    it('getBeadIds returns linked bead IDs', () => {
        const store = makeStore()
        store.sessionBeads.linkBead('session-1', 'hapi-6uf')
        store.sessionBeads.linkBead('session-1', 'hapi-abc')

        const ids = store.sessionBeads.getBeadIds('session-1')

        expect(ids).toEqual(['hapi-6uf', 'hapi-abc'])
    })

    it('reassignSession moves links collision-safe', () => {
        const store = makeStore()
        store.sessionBeads.linkBead('session-old', 'hapi-1')
        store.sessionBeads.linkBead('session-old', 'hapi-2')
        store.sessionBeads.linkBead('session-new', 'hapi-2')
        store.sessionBeads.linkBead('session-new', 'hapi-3')

        store.sessionBeads.reassignSession('session-old', 'session-new')

        expect(store.sessionBeads.getBeadIds('session-old')).toEqual([])
        expect(store.sessionBeads.getBeadIds('session-new').sort()).toEqual(['hapi-1', 'hapi-2', 'hapi-3'])
    })

    it('enforces max 10 beads per session', () => {
        const store = makeStore()
        for (let i = 0; i < 10; i += 1) {
            store.sessionBeads.linkBead('session-1', `hapi-${i}`)
        }

        expect(() => store.sessionBeads.linkBead('session-1', 'hapi-11')).toThrow('Session bead limit reached (max 10)')
    })

    it('snapshot CRUD: save, load, delete', () => {
        const store = makeStore()

        const changed = store.sessionBeads.saveSnapshot('session-1', 'hapi-6uf', {
            id: 'hapi-6uf',
            title: 'Title',
            status: 'open',
            priority: 2
        }, 123)

        expect(changed).toBe(true)
        expect(store.sessionBeads.getSnapshot('session-1', 'hapi-6uf')).toEqual({
            sessionId: 'session-1',
            beadId: 'hapi-6uf',
            data: {
                id: 'hapi-6uf',
                title: 'Title',
                status: 'open',
                priority: 2
            },
            fetchedAt: 123
        })

        const removed = store.sessionBeads.deleteSnapshot('session-1', 'hapi-6uf')
        expect(removed).toBe(true)
        expect(store.sessionBeads.getSnapshot('session-1', 'hapi-6uf')).toBeNull()
    })

    it('snapshot key includes session_id to avoid cross-session contamination', () => {
        const store = makeStore()

        store.sessionBeads.saveSnapshot('session-a', 'hapi-6uf', {
            id: 'hapi-6uf',
            title: 'A',
            status: 'open',
            priority: 2
        }, 100)
        store.sessionBeads.saveSnapshot('session-b', 'hapi-6uf', {
            id: 'hapi-6uf',
            title: 'B',
            status: 'done',
            priority: 1
        }, 200)

        expect(store.sessionBeads.getSnapshot('session-a', 'hapi-6uf')?.data).toEqual({
            id: 'hapi-6uf',
            title: 'A',
            status: 'open',
            priority: 2
        })
        expect(store.sessionBeads.getSnapshot('session-b', 'hapi-6uf')?.data).toEqual({
            id: 'hapi-6uf',
            title: 'B',
            status: 'done',
            priority: 1
        })
    })
})
