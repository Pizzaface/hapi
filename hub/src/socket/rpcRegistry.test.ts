import { describe, expect, it, mock } from 'bun:test'
import type { Socket } from 'socket.io'
import { RpcRegistry } from './rpcRegistry'

function createSocket(id: string): Socket {
    return { id } as Socket
}

describe('RpcRegistry', () => {
    it('prevents a different socket from overwriting an existing method registration', () => {
        const registry = new RpcRegistry()
        const socketA = createSocket('socket-a')
        const socketB = createSocket('socket-b')

        const originalWarn = console.warn
        const warnMock = mock((..._args: unknown[]) => {})
        console.warn = warnMock as unknown as typeof console.warn

        try {
            registry.register(socketA, 'session1:bash')
            registry.register(socketB, 'session1:bash')

            expect(registry.getSocketIdForMethod('session1:bash')).toBe('socket-a')
            expect(warnMock).toHaveBeenCalledTimes(1)
            expect(warnMock).toHaveBeenCalledWith(
                '[RpcRegistry] Method session1:bash already registered by socket socket-a, rejecting from socket-b'
            )
        } finally {
            console.warn = originalWarn
        }
    })

    it('allows another socket to register a method after the original socket unregisters all methods', () => {
        const registry = new RpcRegistry()
        const socketA = createSocket('socket-a')
        const socketB = createSocket('socket-b')

        registry.register(socketA, 'session1:bash')
        registry.unregisterAll(socketA)
        registry.register(socketB, 'session1:bash')

        expect(registry.getSocketIdForMethod('session1:bash')).toBe('socket-b')
    })

    it('allows re-registering the same method from the same socket', () => {
        const registry = new RpcRegistry()
        const socketA = createSocket('socket-a')

        registry.register(socketA, 'session1:bash')
        registry.register(socketA, 'session1:bash')

        expect(registry.getSocketIdForMethod('session1:bash')).toBe('socket-a')
    })
})
