import { createContext, useCallback, useContext, useRef } from 'react'
import type { ReactNode } from 'react'

type BackInterceptorFn = () => boolean

interface DrawerBackInterceptorContextValue {
    registerInterceptor: (fn: BackInterceptorFn) => void
    unregisterInterceptor: () => void
    tryIntercept: () => boolean
}

const DrawerBackInterceptorContext = createContext<DrawerBackInterceptorContextValue | null>(null)

export function DrawerBackInterceptorProvider({ children }: { children: ReactNode }) {
    const interceptorRef = useRef<BackInterceptorFn | null>(null)

    const registerInterceptor = useCallback((fn: BackInterceptorFn) => {
        interceptorRef.current = fn
    }, [])

    const unregisterInterceptor = useCallback(() => {
        interceptorRef.current = null
    }, [])

    const tryIntercept = useCallback(() => {
        if (interceptorRef.current) {
            return interceptorRef.current()
        }
        return false
    }, [])

    return (
        <DrawerBackInterceptorContext.Provider value={{ registerInterceptor, unregisterInterceptor, tryIntercept }}>
            {children}
        </DrawerBackInterceptorContext.Provider>
    )
}

export function useDrawerBackInterceptor() {
    const ctx = useContext(DrawerBackInterceptorContext)
    if (!ctx) {
        throw new Error('useDrawerBackInterceptor must be used within DrawerBackInterceptorProvider')
    }
    return ctx
}

export function useBackInterceptorOptional() {
    return useContext(DrawerBackInterceptorContext)
}
