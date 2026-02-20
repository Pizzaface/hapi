import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModelSelectorDialog } from './ModelSelectorDialog'
import { MODEL_MODES, MODEL_MODE_LABELS, type ModelMode } from '@hapi/protocol'

// Mock the dialog components since they use portals which can be tricky in tests
// But usually @testing-library/react handles it.
// If not, we can rely on the fact that DialogContent usually renders in document.body

describe('ModelSelectorDialog', () => {
    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        currentMode: MODEL_MODES[0],
        onSelect: vi.fn(),
    }

    it('renders the dialog with correct accessibility attributes', () => {
        render(<ModelSelectorDialog {...defaultProps} />)

        // Check for dialog title
        const title = screen.getByText('Select Model')
        expect(title).toBeInTheDocument()
        expect(title).toHaveAttribute('id', 'model-selector-title')

        // Check for radiogroup
        const radioGroup = screen.getByRole('radiogroup')
        expect(radioGroup).toBeInTheDocument()
        expect(radioGroup).toHaveAttribute('aria-labelledby', 'model-selector-title')

        // Check for radio buttons
        const radioButtons = screen.getAllByRole('radio')
        expect(radioButtons).toHaveLength(MODEL_MODES.length)

        // Check labels
        MODEL_MODES.forEach((mode, index) => {
            expect(radioButtons[index]).toHaveTextContent(MODEL_MODE_LABELS[mode])
        })
    })

    it('checks the correct option based on currentMode', () => {
        const currentMode = MODEL_MODES[1]
        render(<ModelSelectorDialog {...defaultProps} currentMode={currentMode} />)

        const checkedButton = screen.getByRole('radio', { checked: true })
        expect(checkedButton).toHaveTextContent(MODEL_MODE_LABELS[currentMode])

        // Verify others are not checked
        const uncheckedButtons = screen.getAllByRole('radio', { checked: false })
        expect(uncheckedButtons).toHaveLength(MODEL_MODES.length - 1)
    })

    it('calls onSelect when an option is clicked', () => {
        const onSelect = vi.fn()
        render(<ModelSelectorDialog {...defaultProps} onSelect={onSelect} />)

        const modeToSelect = MODEL_MODES[1]
        const buttonToClick = screen.getByRole('radio', { name: MODEL_MODE_LABELS[modeToSelect] })

        fireEvent.click(buttonToClick)

        expect(onSelect).toHaveBeenCalledWith(modeToSelect)
    })
})
