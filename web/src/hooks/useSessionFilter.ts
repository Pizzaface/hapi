import { useCallback, useState } from 'react'

const STORAGE_KEY = 'hapi-session-hide-inactive'

function loadFilter(): boolean {
    if (typeof window === 'undefined') {
        return true
    }

    try {
        const value = localStorage.getItem(STORAGE_KEY)
        if (value === 'false') {
            return false
        }
        return true
    } catch {
        return true
    }
}

function persistFilter(hideInactive: boolean): void {
    if (typeof window === 'undefined') {
        return
    }

    try {
        if (hideInactive) {
            localStorage.removeItem(STORAGE_KEY)
        } else {
            localStorage.setItem(STORAGE_KEY, 'false')
        }
    } catch {
        // best-effort
    }
}

export function useSessionFilter(): {
    hideInactive: boolean
    setHideInactive: (v: boolean) => void
    toggleHideInactive: () => void
} {
    const [hideInactive, setHideInactiveState] = useState<boolean>(loadFilter)

    const setHideInactive = useCallback((next: boolean) => {
        setHideInactiveState(next)
        persistFilter(next)
    }, [])

    const toggleHideInactive = useCallback(() => {
        setHideInactiveState(prev => {
            const next = !prev
            persistFilter(next)
            return next
        })
    }, [])

    return {
        hideInactive,
        setHideInactive,
        toggleHideInactive
    }
}
