import { createContext, useContext } from 'react'

interface DrawerContextValue {
    openDrawer: () => void
}

export const DrawerContext = createContext<DrawerContextValue | null>(null)

export function useDrawerContext() {
    return useContext(DrawerContext)
}
