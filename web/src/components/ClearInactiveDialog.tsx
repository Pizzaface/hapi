import { useEffect, useMemo, useRef, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ClearInactiveSessionsOlderThan } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

type ClearInactiveCounts = {
    '7d': number
    '30d': number
    all: number
}

type ClearInactiveDialogProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: (olderThan: ClearInactiveSessionsOlderThan) => Promise<void>
    isPending: boolean
    counts: ClearInactiveCounts
}

const DEFAULT_OLDER_THAN: ClearInactiveSessionsOlderThan = '30d'

export function ClearInactiveDialog(props: ClearInactiveDialogProps) {
    const { t } = useTranslation()
    const {
        isOpen,
        onClose,
        onConfirm,
        isPending,
        counts
    } = props

    const [olderThan, setOlderThan] = useState<ClearInactiveSessionsOlderThan>(DEFAULT_OLDER_THAN)
    const [confirmAll, setConfirmAll] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const confirmInFlightRef = useRef(false)

    useEffect(() => {
        if (!isOpen) {
            return
        }

        setOlderThan(DEFAULT_OLDER_THAN)
        setConfirmAll(false)
        setError(null)
    }, [isOpen])

    const matchingCount = useMemo(() => counts[olderThan], [counts, olderThan])
    const requiresAllConfirmation = olderThan === 'all'
    const canConfirm = matchingCount > 0 && (!requiresAllConfirmation || confirmAll)

    const handleConfirm = async () => {
        if (confirmInFlightRef.current || !canConfirm) {
            return
        }

        confirmInFlightRef.current = true
        setError(null)
        try {
            await onConfirm(olderThan)
            onClose()
        } catch (err) {
            const message = err instanceof Error && err.message
                ? err.message
                : t('dialog.error.default')
            setError(message)
        } finally {
            confirmInFlightRef.current = false
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('dialog.clearInactive.title')}</DialogTitle>
                    <DialogDescription className="mt-2">
                        {t('dialog.clearInactive.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-3">
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-[var(--app-hint)]">{t('dialog.clearInactive.ageLabel')}</span>
                        <select
                            value={olderThan}
                            onChange={(event) => {
                                const value = event.target.value as ClearInactiveSessionsOlderThan
                                setOlderThan(value)
                                if (value !== 'all') {
                                    setConfirmAll(false)
                                }
                            }}
                            disabled={isPending}
                            aria-label={t('dialog.clearInactive.ageLabel')}
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-2 py-1 text-sm"
                        >
                            <option value="7d">{t('dialog.clearInactive.age.7d')}</option>
                            <option value="30d">{t('dialog.clearInactive.age.30d')}</option>
                            <option value="all">{t('dialog.clearInactive.age.all')}</option>
                        </select>
                    </label>

                    <div className="text-sm text-[var(--app-hint)]">
                        {t('dialog.clearInactive.matching', { n: matchingCount })}
                    </div>

                    {requiresAllConfirmation ? (
                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={confirmAll}
                                onChange={(event) => setConfirmAll(event.target.checked)}
                                disabled={isPending}
                                aria-label={t('dialog.clearInactive.allConfirm')}
                            />
                            <span>{t('dialog.clearInactive.allConfirm')}</span>
                        </label>
                    ) : null}

                    {error ? (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        disabled={isPending}
                    >
                        {t('button.cancel')}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void handleConfirm()}
                        disabled={isPending || !canConfirm}
                    >
                        {isPending ? t('dialog.clearInactive.confirming') : t('dialog.clearInactive.confirm')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export type { ClearInactiveCounts }
