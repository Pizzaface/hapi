import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { PersonaSelector } from './PersonaSelector'

function renderPersonaSelector(overrides: Partial<Parameters<typeof PersonaSelector>[0]> = {}) {
    const onPersonaChange = vi.fn()

    render(
        <I18nProvider>
            <PersonaSelector
                agent="claude"
                personas={[
                    { name: 'ops', description: 'Ops workflows', source: 'global' },
                    { name: 'bead-architect', description: 'Bead helper', source: 'project' }
                ]}
                persona={null}
                isDisabled={false}
                onPersonaChange={onPersonaChange}
                {...overrides}
            />
        </I18nProvider>
    )

    return { onPersonaChange }
}

describe('PersonaSelector', () => {
    afterEach(() => {
        cleanup()
    })

    it('renders None plus discovered personas and handles taps', () => {
        const { onPersonaChange } = renderPersonaSelector()

        expect(screen.getByText('Persona')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /None/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /ops/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /bead-architect/i })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /ops/i }))
        expect(onPersonaChange).toHaveBeenCalledWith('ops')
    })

    it('is hidden for non-Claude providers', () => {
        renderPersonaSelector({ agent: 'codex' })

        expect(screen.queryByText('Persona')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /None/i })).not.toBeInTheDocument()
    })

    it('is hidden when no personas are available', () => {
        renderPersonaSelector({ personas: [] })

        expect(screen.queryByText('Persona')).not.toBeInTheDocument()
    })
})
