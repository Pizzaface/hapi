import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionListView } from './useSessionListView'

const STORAGE_KEY = 'hapi-session-list-view'

describe('useSessionListView', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    it("defaults to 'grouped'", () => {
        const { result } = renderHook(() => useSessionListView())

        expect(result.current.view).toBe('grouped')
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it("persists 'flat' to localStorage", () => {
        const { result } = renderHook(() => useSessionListView())

        act(() => {
            result.current.setView('flat')
        })

        expect(result.current.view).toBe('flat')
        expect(localStorage.getItem(STORAGE_KEY)).toBe('flat')
    })

    it("removes key when set to 'grouped'", () => {
        const { result } = renderHook(() => useSessionListView())

        act(() => {
            result.current.setView('flat')
            result.current.setView('grouped')
        })

        expect(result.current.view).toBe('grouped')
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('toggleView flips between modes', () => {
        const { result } = renderHook(() => useSessionListView())

        act(() => {
            result.current.toggleView()
        })
        expect(result.current.view).toBe('flat')

        act(() => {
            result.current.toggleView()
        })
        expect(result.current.view).toBe('grouped')
    })

    it("reads persisted 'flat' on mount", () => {
        localStorage.setItem(STORAGE_KEY, 'flat')

        const { result } = renderHook(() => useSessionListView())

        expect(result.current.view).toBe('flat')
    })

    it("falls back to 'grouped' for invalid localStorage value", () => {
        localStorage.setItem(STORAGE_KEY, 'weird')

        const { result } = renderHook(() => useSessionListView())

        expect(result.current.view).toBe('grouped')
    })

    it("falls back to 'grouped' when localStorage throws", () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })

        const { result } = renderHook(() => useSessionListView())

        expect(result.current.view).toBe('grouped')
    })
})
