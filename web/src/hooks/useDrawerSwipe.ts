import { useCallback, useEffect, useRef, useState } from 'react'
import { useDrawerBackInterceptor } from '@/lib/drawer-back-interceptor'

export interface UseDrawerSwipeOptions {
    /** Whether the drawer feature is enabled (false on desktop) */
    enabled: boolean
    /** Width of the edge zone in px for starting an open swipe (default: 30) */
    edgeZone?: number
    /** Offset threshold (0-1) for snapping open vs closed (default: 0.4) */
    snapThreshold?: number
}

export interface UseDrawerSwipeReturn {
    isOpen: boolean
    isDragging: boolean
    open: () => void
    close: () => void
    /** Ref to attach to the drawer container element */
    containerRef: React.RefObject<HTMLDivElement | null>
    /** Ref to attach to the backdrop element */
    backdropRef: React.RefObject<HTMLDivElement | null>
}

export function useDrawerSwipe(options: UseDrawerSwipeOptions): UseDrawerSwipeReturn {
    const { enabled, edgeZone = 30, snapThreshold = 0.4 } = options

    const [isOpen, setIsOpen] = useState(false)
    const [isDragging, setIsDragging] = useState(false)

    const containerRef = useRef<HTMLDivElement | null>(null)
    const backdropRef = useRef<HTMLDivElement | null>(null)

    // Gesture tracking refs
    const touchIdRef = useRef<number | null>(null)
    const startXRef = useRef(0)
    const startYRef = useRef(0)
    const axisLockedRef = useRef(false)
    const isClosingRef = useRef(false)
    const isOpenRef = useRef(false)
    const drawerWidthRef = useRef(0)

    // Keep isOpenRef in sync
    useEffect(() => {
        isOpenRef.current = isOpen
    }, [isOpen])

    const setOffset = useCallback((value: number) => {
        const container = containerRef.current
        if (container) {
            container.style.setProperty('--drawer-offset', String(value))
        }
        const backdrop = backdropRef.current
        if (backdrop) {
            backdrop.style.setProperty('--drawer-offset', String(value))
        }
    }, [])

    const open = useCallback(() => {
        isOpenRef.current = true
        setIsOpen(true)
        setIsDragging(false)
        setOffset(1)
    }, [setOffset])

    const close = useCallback(() => {
        isOpenRef.current = false
        setIsOpen(false)
        setIsDragging(false)
        setOffset(0)
    }, [setOffset])

    // Register back interceptor: close drawer on back if open
    const { registerInterceptor, unregisterInterceptor } = useDrawerBackInterceptor()

    useEffect(() => {
        if (!enabled) return

        registerInterceptor(() => {
            if (isOpenRef.current) {
                close()
                return true
            }
            return false
        })

        return () => {
            unregisterInterceptor()
        }
    }, [enabled, close, registerInterceptor, unregisterInterceptor])

    // Touch event handlers
    useEffect(() => {
        if (!enabled) return

        const handleTouchStart = (e: TouchEvent) => {
            if (touchIdRef.current !== null) return
            const touch = e.touches[0]
            if (!touch) return

            const x = touch.clientX
            const currentlyOpen = isOpenRef.current

            if (currentlyOpen) {
                // Only start close gesture on backdrop (right of drawer panel)
                const backdrop = backdropRef.current
                if (!backdrop) return
                const backdropRect = backdrop.getBoundingClientRect()
                if (
                    x < backdropRect.left ||
                    x > backdropRect.right ||
                    touch.clientY < backdropRect.top ||
                    touch.clientY > backdropRect.bottom
                ) {
                    return
                }
                isClosingRef.current = true
            } else {
                // Only start open gesture from edge zone
                if (x > edgeZone) return
                isClosingRef.current = false
            }

            touchIdRef.current = touch.identifier
            startXRef.current = x
            startYRef.current = touch.clientY
            axisLockedRef.current = false

            // Measure drawer width
            const container = containerRef.current
            if (container) {
                drawerWidthRef.current = container.offsetWidth
            }
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (touchIdRef.current === null) return

            let touch: Touch | undefined
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i]!.identifier === touchIdRef.current) {
                    touch = e.touches[i]
                    break
                }
            }
            if (!touch) return

            const dx = touch.clientX - startXRef.current
            const dy = touch.clientY - startYRef.current

            // Axis lock check: don't claim gesture until clear horizontal intent
            if (!axisLockedRef.current) {
                const absDx = Math.abs(dx)
                const absDy = Math.abs(dy)
                // Need some minimum movement to decide
                if (absDx < 10 && absDy < 10) return
                // If vertical dominates, cancel this gesture
                if (absDx < absDy * 1.5) {
                    touchIdRef.current = null
                    return
                }
                axisLockedRef.current = true
                setIsDragging(true)
            }

            // Prevent vertical scroll while dragging
            e.preventDefault()

            const width = drawerWidthRef.current || 1

            let offset: number
            if (isClosingRef.current) {
                // Closing: started from open position, dx is negative
                offset = Math.max(0, Math.min(1, 1 + dx / width))
            } else {
                // Opening: dx is positive
                offset = Math.max(0, Math.min(1, dx / width))
            }
            setOffset(offset)
        }

        const handleTouchEnd = (e: TouchEvent) => {
            if (touchIdRef.current === null) return

            let found = false
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i]!.identifier === touchIdRef.current) {
                    found = true
                    break
                }
            }
            if (!found) return

            touchIdRef.current = null

            if (!axisLockedRef.current) {
                // Never committed to the gesture — nothing to do
                return
            }

            // Read current offset from CSS property
            const container = containerRef.current
            const currentOffset = container
                ? Number.parseFloat(container.style.getPropertyValue('--drawer-offset') || '0')
                : 0

            setIsDragging(false)

            if (currentOffset >= snapThreshold) {
                isOpenRef.current = true
                setIsOpen(true)
                setOffset(1)
            } else {
                isOpenRef.current = false
                setIsOpen(false)
                setOffset(0)
            }
        }

        document.addEventListener('touchstart', handleTouchStart, { passive: true })
        document.addEventListener('touchmove', handleTouchMove, { passive: false })
        document.addEventListener('touchend', handleTouchEnd, { passive: true })
        document.addEventListener('touchcancel', handleTouchEnd, { passive: true })

        return () => {
            document.removeEventListener('touchstart', handleTouchStart)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
            document.removeEventListener('touchcancel', handleTouchEnd)
        }
    }, [enabled, edgeZone, snapThreshold, setOffset])

    return {
        isOpen,
        isDragging,
        open,
        close,
        containerRef,
        backdropRef,
    }
}
