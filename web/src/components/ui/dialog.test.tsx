import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'

afterEach(cleanup)

function renderDialog(props: { resizable?: boolean; style?: React.CSSProperties; className?: string } = {}) {
    render(
        <Dialog open>
            <DialogContent {...props}>
                <DialogHeader>
                    <DialogTitle>Test Dialog</DialogTitle>
                </DialogHeader>
                <div>Body content</div>
            </DialogContent>
        </Dialog>
    )
    return screen.getByRole('dialog')
}

describe('DialogContent', () => {
    describe('default (non-resizable)', () => {
        it('renders with fixed-width classes', () => {
            const dialog = renderDialog()
            expect(dialog.className).toContain('max-w-lg')
            expect(dialog.className).toContain('w-[calc(100vw-24px)]')
        })

        it('does not apply resize or flex classes', () => {
            const dialog = renderDialog()
            expect(dialog.className).not.toContain('resize')
            expect(dialog.className).not.toContain('flex-col')
        })

        it('does not set inline sizing styles', () => {
            const dialog = renderDialog()
            expect(dialog.style.width).toBe('')
            expect(dialog.style.maxWidth).toBe('')
        })

        it('passes through custom style', () => {
            const dialog = renderDialog({ style: { color: 'red' } })
            expect(dialog.style.color).toBe('red')
        })
    })

    describe('resizable', () => {
        it('applies resize and flex-col classes', () => {
            const dialog = renderDialog({ resizable: true })
            expect(dialog.className).toContain('resize')
            expect(dialog.className).toContain('flex')
            expect(dialog.className).toContain('flex-col')
            expect(dialog.className).toContain('overflow-hidden')
        })

        it('does not apply fixed-width classes', () => {
            const dialog = renderDialog({ resizable: true })
            expect(dialog.className).not.toContain('max-w-lg')
            expect(dialog.className).not.toContain('w-[calc(100vw-24px)]')
        })

        it('sets fit-content width with size constraints', () => {
            const dialog = renderDialog({ resizable: true })
            expect(dialog.style.width).toBe('fit-content')
            expect(dialog.style.maxWidth).toBe('min(80vw, calc(100vw - 24px))')
            expect(dialog.style.maxHeight).toBe('90vh')
            expect(dialog.style.minWidth).toBe('320px')
            expect(dialog.style.minHeight).toBe('160px')
        })

        it('allows style overrides for maxWidth', () => {
            const dialog = renderDialog({
                resizable: true,
                style: { maxWidth: 'min(90vw, calc(100vw - 24px))' },
            })
            expect(dialog.style.maxWidth).toBe('min(90vw, calc(100vw - 24px))')
            expect(dialog.style.width).toBe('fit-content')
        })

        it('allows style overrides for minWidth', () => {
            const dialog = renderDialog({
                resizable: true,
                style: { minWidth: '400px' },
            })
            expect(dialog.style.minWidth).toBe('400px')
        })

        it('merges additional className', () => {
            const dialog = renderDialog({ resizable: true, className: 'custom-class' })
            expect(dialog.className).toContain('resize')
            expect(dialog.className).toContain('custom-class')
        })
    })

    it('does not leak resizable prop to the DOM', () => {
        const dialog = renderDialog({ resizable: true })
        expect(dialog.getAttribute('resizable')).toBeNull()
    })
})
