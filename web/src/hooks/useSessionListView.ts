import { useCallback, useState } from 'react'

export type SessionListView = 'grouped' | 'flat'

const STORAGE_KEY = 'hapi-session-list-view'

function loadView(): SessionListView {
    if (typeof window === 'undefined') {
        return 'grouped'
    }

    try {
        const value = localStorage.getItem(STORAGE_KEY)
        if (value === 'flat') {
            return 'flat'
        }
        return 'grouped'
    } catch {
        return 'grouped'
    }
}

function persistView(view: SessionListView): void {
    if (typeof window === 'undefined') {
        return
    }

    try {
        if (view === 'flat') {
            localStorage.setItem(STORAGE_KEY, 'flat')
        } else {
            localStorage.removeItem(STORAGE_KEY)
        }
    } catch {
        // best-effort
    }
}

export function useSessionListView(): {
    view: SessionListView
    setView: (v: SessionListView) => void
    toggleView: () => void
} {
    const [view, setViewState] = useState<SessionListView>(loadView)

    const setView = useCallback((nextView: SessionListView) => {
        setViewState(nextView)
        persistView(nextView)
    }, [])

    const toggleView = useCallback(() => {
        setViewState(prev => {
            const next: SessionListView = prev === 'grouped' ? 'flat' : 'grouped'
            persistView(next)
            return next
        })
    }, [])

    return {
        view,
        setView,
        toggleView
    }
}
