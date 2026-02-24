import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Toast } from './Toast'
import { I18nProvider } from '@/lib/i18n-context'

afterEach(() => {
    cleanup()
})

describe('Toast', () => {
    it('renders title and body', () => {
        render(
            <I18nProvider>
                <Toast title="Test Title" body="Test Body" />
            </I18nProvider>
        )
        expect(screen.getByText('Test Title')).toBeInTheDocument()
        expect(screen.getByText('Test Body')).toBeInTheDocument()
    })

    it('renders close button when onClose is provided', () => {
        const onClose = vi.fn()
        render(
            <I18nProvider>
                <Toast title="Test Title" body="Test Body" onClose={onClose} />
            </I18nProvider>
        )
        const closeButton = screen.getByRole('button', { name: /dismiss/i })
        expect(closeButton).toBeInTheDocument()

        fireEvent.click(closeButton)
        expect(onClose).toHaveBeenCalled()
    })

    it('does not render close button when onClose is not provided', () => {
        render(
            <I18nProvider>
                <Toast title="Test Title" body="Test Body" />
            </I18nProvider>
        )
        const closeButton = screen.queryByRole('button', { name: /dismiss/i })
        expect(closeButton).not.toBeInTheDocument()
    })
})
