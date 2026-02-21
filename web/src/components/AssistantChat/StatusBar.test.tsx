import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, within } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { StatusBar } from './StatusBar'

afterEach(() => {
    cleanup()
})

function renderStatusBar(props: Parameters<typeof StatusBar>[0]) {
    const result = render(
        <I18nProvider>
            <StatusBar {...props} />
        </I18nProvider>
    )
    return { ...result, view: within(result.container) }
}

beforeEach(() => {
    const localStorageMock = {
        getItem: vi.fn(() => 'en'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
    }
    Object.defineProperty(window, 'localStorage', { value: localStorageMock })
})

describe('StatusBar', () => {
    it('shows "online" when active and idle', () => {
        const { view } = renderStatusBar({
            active: true,
            thinking: false,
            agentState: null,
        })
        expect(view.getByText('online')).toBeInTheDocument()
    })

    it('shows "offline" when not active', () => {
        const { view } = renderStatusBar({
            active: false,
            thinking: false,
            agentState: null,
        })
        expect(view.getByText('offline')).toBeInTheDocument()
    })

    it('shows a vibing message when thinking', () => {
        const { view } = renderStatusBar({
            active: true,
            thinking: true,
            agentState: null,
        })
        expect(view.queryByText('online')).toBeNull()
        expect(view.queryByText('offline')).toBeNull()
    })

    it('shows pulsing animation when thinking', () => {
        const { container } = renderStatusBar({
            active: true,
            thinking: true,
            agentState: null,
        })
        const dot = container.querySelector('.rounded-full')
        expect(dot?.className).toContain('animate-pulse')
    })

    it('does not pulse when online and idle', () => {
        const { container } = renderStatusBar({
            active: true,
            thinking: false,
            agentState: null,
        })
        const dot = container.querySelector('.rounded-full')
        expect(dot?.className).not.toContain('animate-pulse')
    })

    it('shows permission required when permissions pending', () => {
        const { view } = renderStatusBar({
            active: true,
            thinking: false,
            agentState: { requests: { 'req-1': {} } } as any,
        })
        expect(view.getByText('permission required')).toBeInTheDocument()
        expect(view.queryByText('online')).toBeNull()
    })

    it('shows offline when not active regardless of other state', () => {
        const { view } = renderStatusBar({
            active: false,
            thinking: false,
            agentState: null,
        })
        expect(view.getByText('offline')).toBeInTheDocument()
    })

    it('shows subtitle when thinking with thinkingActivity', () => {
        const { container } = renderStatusBar({
            active: true,
            thinking: true,
            thinkingActivity: 'compacting',
            agentState: null,
        })
        const subtitle = container.querySelector('[data-testid="thinking-subtitle"]')
        expect(subtitle).toBeInTheDocument()
        expect(subtitle?.textContent).toBe('Compacting context...')
    })

    it('hides subtitle when thinkingActivity is null', () => {
        const { container } = renderStatusBar({
            active: true,
            thinking: true,
            thinkingActivity: null,
            agentState: null,
        })
        const subtitle = container.querySelector('[data-testid="thinking-subtitle"]')
        expect(subtitle).toBeNull()
    })

    it('hides subtitle when not thinking even if thinkingActivity is set', () => {
        const { container } = renderStatusBar({
            active: true,
            thinking: false,
            thinkingActivity: 'compacting',
            agentState: null,
        })
        const subtitle = container.querySelector('[data-testid="thinking-subtitle"]')
        expect(subtitle).toBeNull()
    })
})
