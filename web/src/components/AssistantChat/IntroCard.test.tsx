import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, within } from '@testing-library/react'
import { IntroCard, type IntroCardProps } from './IntroCard'

afterEach(() => {
    cleanup()
})

function renderCard(props: Partial<IntroCardProps> = {}) {
    const result = render(<IntroCard {...props} />)
    return { ...result, view: within(result.container) }
}

describe('IntroCard', () => {
    it('renders standard session fields', () => {
        const { view } = renderCard({
            flavor: 'claude',
            permissionMode: 'default',
            modelMode: 'opus',
            path: '/home/allen/_code/hapi',
            worktree: { basePath: '/home/allen/_code/hapi', branch: 'main', name: 'main' },
        })
        expect(view.getByText('Claude')).toBeInTheDocument()
        expect(view.getByText('Default')).toBeInTheDocument()
        expect(view.getByText('Opus')).toBeInTheDocument()
        expect(view.getByText('_code/hapi')).toBeInTheDocument()
        expect(view.getByText('main')).toBeInTheDocument()
    })

    it('renders spawned session with spawn badge and omits model mode', () => {
        const { view } = renderCard({
            flavor: 'claude',
            permissionMode: 'plan',
            modelMode: 'opus',
            path: '/home/allen/_code/hapi',
            startedBy: 'runner',
        })
        expect(view.getByText('Spawned')).toBeInTheDocument()
        expect(view.getByText('Claude')).toBeInTheDocument()
        expect(view.queryByText('Opus')).toBeNull()
    })

    it('handles missing metadata gracefully', () => {
        const { container } = renderCard({})
        // Should render without crashing, with no visible metadata items
        const items = container.querySelectorAll('[data-testid^="intro-"]')
        expect(items.length).toBe(0)
    })

    it('detects spawn via startedFromRunner fallback', () => {
        const { view } = renderCard({
            flavor: 'codex',
            path: '/tmp/work',
            startedFromRunner: true,
        })
        expect(view.getByText('Spawned')).toBeInTheDocument()
        expect(view.getByText('Codex')).toBeInTheDocument()
    })

    it('omits modelMode for non-Claude sessions', () => {
        const { view } = renderCard({
            flavor: 'codex',
            permissionMode: 'default',
            modelMode: 'opus',
            path: '/tmp/work',
        })
        expect(view.getByText('Codex')).toBeInTheDocument()
        expect(view.queryByText('Opus')).toBeNull()
    })

    it('omits modelMode when set to default', () => {
        const { view } = renderCard({
            flavor: 'claude',
            permissionMode: 'plan',
            modelMode: 'default',
            path: '/tmp/work',
        })
        expect(view.getByText('Claude')).toBeInTheDocument()
        expect(view.getByText('Plan Mode')).toBeInTheDocument()
        expect(view.queryByText('Default')).toBeNull()
    })

    it('shortens long paths to last 2 segments', () => {
        const { view } = renderCard({
            path: '/Users/alice/projects/deep/nested/myapp',
        })
        expect(view.getByText('nested/myapp')).toBeInTheDocument()
    })

    it('shows full short paths', () => {
        const { view } = renderCard({
            path: '/tmp',
        })
        expect(view.getByText('/tmp')).toBeInTheDocument()
    })

    it('renders with data-testid attributes for each field', () => {
        const { container } = renderCard({
            flavor: 'claude',
            permissionMode: 'plan',
            path: '/home/allen/_code/hapi',
            worktree: { basePath: '/home/allen/_code/hapi', branch: 'feat-x', name: 'feat-x' },
        })
        expect(container.querySelector('[data-testid="intro-flavor"]')).toBeInTheDocument()
        expect(container.querySelector('[data-testid="intro-permission"]')).toBeInTheDocument()
        expect(container.querySelector('[data-testid="intro-path"]')).toBeInTheDocument()
        expect(container.querySelector('[data-testid="intro-branch"]')).toBeInTheDocument()
    })
})
