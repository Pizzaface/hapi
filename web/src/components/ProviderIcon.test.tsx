import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProviderIcon } from './ProviderIcon'

describe('ProviderIcon', () => {
    it('renders distinct SVG markup for each known provider', () => {
        const flavors = ['claude', 'codex', 'gemini', 'opencode'] as const

        const signatures = flavors.map((flavor) => {
            const view = render(<ProviderIcon flavor={flavor} />)
            const wrapper = view.container.querySelector<HTMLElement>(`[data-provider-key="${flavor}"]`)
            expect(wrapper).toBeInTheDocument()
            const svg = wrapper?.querySelector<SVGSVGElement>('svg')
            expect(svg).toBeInTheDocument()
            return svg?.innerHTML ?? ''
        })

        expect(new Set(signatures).size).toBe(flavors.length)
    })

    it('renders fallback for unknown flavor', () => {
        const { container } = render(<ProviderIcon flavor="mystery" />)
        expect(container.querySelector('[data-provider-key="unknown"]')).toBeInTheDocument()
    })

    it('renders icon as decorative aria-hidden element', () => {
        const { container } = render(<ProviderIcon flavor="claude" />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('aria-hidden', 'true')
    })

    it('exposes data-provider-key on wrapper', () => {
        const { container } = render(<ProviderIcon flavor="gemini" className="custom-class" />)
        const wrapper = container.querySelector<HTMLElement>('[data-provider-key="gemini"]')
        expect(wrapper).toBeInTheDocument()
        expect(wrapper).toHaveClass('custom-class')
    })
})
