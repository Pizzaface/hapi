import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/components/MarkdownRenderer', () => ({
    MarkdownRenderer: (props: { content: string }) => <div>{props.content}</div>
}))
import { SessionBeadPanel } from './SessionBeadPanel'

afterEach(() => {
    cleanup()
})

const baseBead = {
    id: 'hapi-6uf',
    title: 'Beads panel',
    status: 'in_progress',
    priority: 2,
    acceptance_criteria: '- AC one\n- AC two'
}

describe('SessionBeadPanel', () => {
    it('renders nothing when beads are empty', () => {
        const { container } = render(<SessionBeadPanel beads={[]} stale={false} />)

        expect(container.firstChild).toBeNull()
    })

    it('renders bead title, status, and priority', () => {
        render(<SessionBeadPanel beads={[baseBead]} stale={false} />)

        expect(screen.getByText('Beads panel')).toBeInTheDocument()
        expect(screen.getByTestId('bead-status-hapi-6uf')).toHaveTextContent('in progress')
        expect(screen.getByText('P2')).toBeInTheDocument()
    })

    it('renders acceptance criteria markdown', () => {
        render(<SessionBeadPanel beads={[baseBead]} stale={false} />)

        expect(screen.getByText(/AC one/)).toBeInTheDocument()
        expect(screen.getByText(/AC two/)).toBeInTheDocument()
    })

    it('shows stale indicator', () => {
        render(<SessionBeadPanel beads={[baseBead]} stale={true} />)

        expect(screen.getByText('(stale)')).toBeInTheDocument()
    })

    it('collapses and expands on header click', () => {
        render(<SessionBeadPanel beads={[baseBead]} stale={false} />)

        const button = screen.getAllByRole('button', { name: /beads/i })[0]
        expect(button).toHaveAttribute('aria-expanded', 'true')

        fireEvent.click(button)
        expect(button).toHaveAttribute('aria-expanded', 'false')

        fireEvent.click(button)
        expect(button).toHaveAttribute('aria-expanded', 'true')
    })

    it('maps status badges to expected color classes', () => {
        const beads = [
            { ...baseBead, id: 'open', status: 'open' },
            { ...baseBead, id: 'progress', status: 'in_progress' },
            { ...baseBead, id: 'done', status: 'done' },
            { ...baseBead, id: 'blocked', status: 'blocked' },
            { ...baseBead, id: 'deferred', status: 'deferred' }
        ]

        render(<SessionBeadPanel beads={beads} stale={false} />)

        expect(screen.getByTestId('bead-status-open').className).toContain('text-gray-')
        expect(screen.getByTestId('bead-status-progress').className).toContain('text-blue-')
        expect(screen.getByTestId('bead-status-done').className).toContain('text-green-')
        expect(screen.getByTestId('bead-status-blocked').className).toContain('text-red-')
        expect(screen.getByTestId('bead-status-deferred').className).toContain('text-amber-')
    })
})
