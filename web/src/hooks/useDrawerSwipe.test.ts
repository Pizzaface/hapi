import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { DrawerBackInterceptorProvider } from '@/lib/drawer-back-interceptor'
import { useDrawerSwipe } from './useDrawerSwipe'

function wrapper({ children }: { children: ReactNode }) {
    return createElement(DrawerBackInterceptorProvider, null, children)
}

function createMockDiv(width = 400): HTMLDivElement {
    const div = document.createElement('div')
    Object.defineProperty(div, 'offsetWidth', { value: width, configurable: true })
    div.style.setProperty = vi.fn()
    div.style.getPropertyValue = vi.fn().mockReturnValue('0')
    div.getBoundingClientRect = vi.fn().mockReturnValue({
        left: width, right: window.innerWidth, top: 0, bottom: window.innerHeight,
        width: window.innerWidth - width, height: window.innerHeight,
        x: width, y: 0, toJSON: () => ({}),
    })
    return div
}

function fireTouch(
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
    x: number,
    y: number,
    identifier = 0
) {
    const touch = { clientX: x, clientY: y, identifier } as Touch
    const eventInit: TouchEventInit = {
        touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
        changedTouches: [touch],
        cancelable: true,
    }
    const event = new TouchEvent(type, eventInit)
    document.dispatchEvent(event)
}

describe('useDrawerSwipe', () => {
    let containerDiv: HTMLDivElement
    let backdropDiv: HTMLDivElement

    beforeEach(() => {
        containerDiv = createMockDiv(340)
        backdropDiv = createMockDiv()
        backdropDiv.getBoundingClientRect = vi.fn().mockReturnValue({
            left: 340, right: 400, top: 0, bottom: 800,
            width: 60, height: 800, x: 340, y: 0, toJSON: () => ({}),
        })
        Object.defineProperty(window, 'innerWidth', { value: 400, writable: true, configurable: true })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not activate on non-edge touches', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        act(() => {
            fireTouch('touchstart', 100, 400)
            fireTouch('touchmove', 200, 400)
            fireTouch('touchend', 200, 400)
        })

        expect(result.current.isDragging).toBe(false)
        expect(result.current.isOpen).toBe(false)
    })

    it('does not activate when vertical movement dominates', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        act(() => {
            fireTouch('touchstart', 10, 400)
            fireTouch('touchmove', 15, 430)
            fireTouch('touchend', 15, 430)
        })

        expect(result.current.isDragging).toBe(false)
        expect(result.current.isOpen).toBe(false)
    })

    it('tracks touch movement and sets isDragging', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        act(() => {
            fireTouch('touchstart', 10, 400)
            fireTouch('touchmove', 170, 402)
        })

        expect(result.current.isDragging).toBe(true)
        expect(containerDiv.style.setProperty).toHaveBeenCalledWith(
            '--drawer-offset',
            expect.any(String)
        )
    })

    it('snaps open when released past threshold', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        containerDiv.style.getPropertyValue = vi.fn().mockReturnValue('0.5')

        act(() => {
            fireTouch('touchstart', 10, 400)
            fireTouch('touchmove', 180, 402)
            fireTouch('touchend', 180, 402)
        })

        expect(result.current.isOpen).toBe(true)
        expect(result.current.isDragging).toBe(false)
    })

    it('snaps closed when released below threshold', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        containerDiv.style.getPropertyValue = vi.fn().mockReturnValue('0.3')

        act(() => {
            fireTouch('touchstart', 10, 400)
            fireTouch('touchmove', 100, 402)
            fireTouch('touchend', 100, 402)
        })

        expect(result.current.isOpen).toBe(false)
        expect(result.current.isDragging).toBe(false)
    })

    it('close() resets state', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        act(() => result.current.open())
        expect(result.current.isOpen).toBe(true)

        act(() => result.current.close())
        expect(result.current.isOpen).toBe(false)
        expect(containerDiv.style.setProperty).toHaveBeenCalledWith('--drawer-offset', '0')
    })

    it('open() sets full open state', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        act(() => result.current.open())

        expect(result.current.isOpen).toBe(true)
        expect(result.current.isDragging).toBe(false)
        expect(containerDiv.style.setProperty).toHaveBeenCalledWith('--drawer-offset', '1')
    })

    it('isDragging is true during active touch and false after release', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        // Start touch
        act(() => {
            fireTouch('touchstart', 10, 400)
        })
        expect(result.current.isDragging).toBe(false)

        // Move to trigger axis lock
        act(() => {
            fireTouch('touchmove', 100, 402)
        })
        expect(result.current.isDragging).toBe(true)

        // Release
        containerDiv.style.getPropertyValue = vi.fn().mockReturnValue('0.5')
        act(() => {
            fireTouch('touchend', 100, 402)
        })
        expect(result.current.isDragging).toBe(false)
    })

    it('does nothing when disabled', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: false }),
            { wrapper }
        )

        act(() => {
            fireTouch('touchstart', 10, 400)
            fireTouch('touchmove', 200, 402)
            fireTouch('touchend', 200, 402)
        })

        expect(result.current.isOpen).toBe(false)
        expect(result.current.isDragging).toBe(false)
    })

    it('touchcancel resets isDragging and snaps based on offset', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        containerDiv.style.getPropertyValue = vi.fn().mockReturnValue('0.2')

        act(() => {
            fireTouch('touchstart', 10, 400)
            fireTouch('touchmove', 100, 402)
        })
        expect(result.current.isDragging).toBe(true)

        act(() => {
            fireTouch('touchcancel', 100, 402)
        })
        expect(result.current.isDragging).toBe(false)
        expect(result.current.isOpen).toBe(false)
    })

    it('ignores touches from a different identifier during active gesture', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        // Start gesture with identifier 0
        act(() => {
            fireTouch('touchstart', 10, 400, 0)
            fireTouch('touchmove', 100, 402, 0)
        })
        expect(result.current.isDragging).toBe(true)

        // A second touch with different identifier should not interfere
        act(() => {
            fireTouch('touchstart', 200, 300, 1)
        })

        // Original gesture should still be active
        expect(result.current.isDragging).toBe(true)
    })

    it('close swipe on open drawer snaps closed', () => {
        const { result } = renderHook(
            () => useDrawerSwipe({ enabled: true }),
            { wrapper }
        )

        result.current.containerRef.current = containerDiv
        result.current.backdropRef.current = backdropDiv

        // Open the drawer programmatically
        act(() => result.current.open())
        expect(result.current.isOpen).toBe(true)

        // Reconfigure backdrop mock for close gesture detection
        // Touch on the backdrop area (right side, past the drawer panel)
        backdropDiv.getBoundingClientRect = vi.fn().mockReturnValue({
            left: 340, right: 400, top: 0, bottom: 800,
            width: 60, height: 800, x: 340, y: 0, toJSON: () => ({}),
        })

        // Mock offset reading for snap decision (dragged mostly closed)
        containerDiv.style.getPropertyValue = vi.fn().mockReturnValue('0.2')

        act(() => {
            // Touch starts on backdrop
            fireTouch('touchstart', 360, 400)
            // Swipe left (negative dx)
            fireTouch('touchmove', 200, 402)
            fireTouch('touchend', 200, 402)
        })

        expect(result.current.isOpen).toBe(false)
        expect(result.current.isDragging).toBe(false)
    })
})
