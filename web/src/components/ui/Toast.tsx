import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { CloseIcon } from '../icons'
import { useTranslation } from '@/lib/use-translation'

const toastVariants = cva(
    'pointer-events-auto w-full max-w-sm rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] shadow-lg',
    {
        variants: {
            variant: {
                default: 'border-[var(--app-border)] bg-[var(--app-bg)]'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
)

export type ToastProps = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof toastVariants> & {
    title: string
    body: string
    onClose?: () => void
}

export function Toast({ title, body, onClose, className, variant, ...props }: ToastProps) {
    const { t } = useTranslation()
    const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onClose?.()
    }

    return (
        <div className={cn(toastVariants({ variant }), className)} role="status" {...props}>
            <div className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5">{title}</div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">{body}</div>
                </div>
                {onClose ? (
                    <button
                        type="button"
                        className="rounded-md p-1 text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                        onClick={handleClose}
                        aria-label={t('button.dismiss')}
                    >
                        <CloseIcon className="h-4 w-4" />
                    </button>
                ) : null}
            </div>
        </div>
    )
}
