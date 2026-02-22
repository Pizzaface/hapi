import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { ClearInactiveDialog } from './ClearInactiveDialog'

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

type RenderDialogOptions = {
    counts?: { '7d': number; '30d': number; all: number }
    isPending?: boolean
    onClose?: () => void
    onConfirm?: (olderThan: '7d' | '30d' | 'all') => Promise<void>
}

function renderDialog(options: RenderDialogOptions = {}) {
    const onClose = options.onClose ?? vi.fn()
    const onConfirm = options.onConfirm ?? vi.fn().mockResolvedValue(undefined)

    render(
        <I18nProvider>
            <ClearInactiveDialog
                isOpen={true}
                onClose={onClose}
                onConfirm={onConfirm}
                isPending={options.isPending ?? false}
                counts={options.counts ?? { '7d': 4, '30d': 2, all: 6 }}
            />
        </I18nProvider>
    )

    return { onClose, onConfirm }
}

describe('ClearInactiveDialog', () => {
    it('shows count with default age filter', () => {
        renderDialog({ counts: { '7d': 3, '30d': 1, all: 4 } })

        const ageFilter = screen.getByRole('combobox', { name: 'Age' })
        expect((ageFilter as HTMLSelectElement).value).toBe('30d')
        expect(screen.getByText('1 matching inactive sessions')).toBeInTheDocument()
    })

    it('updates count when age filter changes', () => {
        renderDialog({ counts: { '7d': 3, '30d': 1, all: 4 } })

        const ageFilter = screen.getByRole('combobox', { name: 'Age' })
        fireEvent.change(ageFilter, { target: { value: '7d' } })
        expect(screen.getByText('3 matching inactive sessions')).toBeInTheDocument()

        fireEvent.change(ageFilter, { target: { value: 'all' } })
        expect(screen.getByText('4 matching inactive sessions')).toBeInTheDocument()
    })

    it('requires extra confirmation when clearing all inactive sessions', async () => {
        const { onConfirm, onClose } = renderDialog()

        const ageFilter = screen.getByRole('combobox', { name: 'Age' })
        fireEvent.change(ageFilter, { target: { value: 'all' } })

        const confirmButton = screen.getByRole('button', { name: 'Clear inactive' })
        expect(confirmButton).toBeDisabled()

        fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this will clear all inactive sessions.' }))
        expect(confirmButton).toBeEnabled()

        fireEvent.click(confirmButton)

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledTimes(1)
            expect(onConfirm).toHaveBeenCalledWith('all')
            expect(onClose).toHaveBeenCalledTimes(1)
        })
    })
})
