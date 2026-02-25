import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { RenameSessionDialog } from './RenameSessionDialog'

// Mock Radix UI Dialog because it uses Portals which can be tricky in JSDOM
// However, @testing-library/react usually handles it well if we look at the document body.
// But let's try rendering it normally first.

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('RenameSessionDialog', () => {
    const mockOnClose = vi.fn()
    const mockOnRename = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock localStorage for I18nProvider
        const localStorageMock = {
            getItem: vi.fn(() => 'en'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        }
        Object.defineProperty(window, 'localStorage', { value: localStorageMock })
    })

    afterEach(() => {
        cleanup()
    })

    it('renders with initial name and focuses input', async () => {
        renderWithProviders(
            <RenameSessionDialog
                isOpen={true}
                onClose={mockOnClose}
                currentName="My Session"
                onRename={mockOnRename}
                isPending={false}
            />
        )

        // Check if dialog title is present
        expect(screen.getByRole('heading', { name: 'Rename Session' })).toBeInTheDocument()

        // Check input value
        const input = screen.getByDisplayValue('My Session')
        expect(input).toBeInTheDocument()

        // Check accessibility label (this will fail until implemented)
        // We use regex to match loosely or exact string from en.ts
        // 'dialog.rename.placeholder': 'Session name'
        expect(input).toHaveAttribute('aria-label', 'Session name')

        // Check focus (might need waitFor due to onOpenAutoFocus)
        await waitFor(() => {
            expect(input).toHaveFocus()
        })
    })

    it('calls onRename with new name on submit', async () => {
        mockOnRename.mockResolvedValue(undefined)

        renderWithProviders(
            <RenameSessionDialog
                isOpen={true}
                onClose={mockOnClose}
                currentName="My Session"
                onRename={mockOnRename}
                isPending={false}
            />
        )

        const input = screen.getByDisplayValue('My Session')
        fireEvent.change(input, { target: { value: 'New Name' } })

        const saveButton = screen.getByRole('button', { name: 'Save' })
        fireEvent.click(saveButton)

        expect(mockOnRename).toHaveBeenCalledWith('New Name')
    })

    it('shows error message with alert role on failure', async () => {
        mockOnRename.mockRejectedValue(new Error('Failed'))

        renderWithProviders(
            <RenameSessionDialog
                isOpen={true}
                onClose={mockOnClose}
                currentName="My Session"
                onRename={mockOnRename}
                isPending={false}
            />
        )

        const input = screen.getByDisplayValue('My Session')
        fireEvent.change(input, { target: { value: 'Fail Name' } })

        const saveButton = screen.getByRole('button', { name: 'Save' })
        fireEvent.click(saveButton)

        // Wait for error message
        const errorMessage = await screen.findByText('Failed to rename. Please try again.')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveAttribute('role', 'alert')

        // Input should be marked invalid
        expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    it('closes on cancel', () => {
        renderWithProviders(
            <RenameSessionDialog
                isOpen={true}
                onClose={mockOnClose}
                currentName="My Session"
                onRename={mockOnRename}
                isPending={false}
            />
        )

        const cancelButton = screen.getByRole('button', { name: 'Cancel' })
        fireEvent.click(cancelButton)

        expect(mockOnClose).toHaveBeenCalled()
    })
})
