import { useCallback, useEffect, useRef, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { CloseIcon } from '@/components/icons'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { usePointerFocusRing } from '@/hooks/usePointerFocusRing'
import { imageModalState } from '@/lib/image-modal-state'
import { cn } from '@/lib/utils'

type ChatImageProps = {
    src: string
    alt?: string
    maxHeight?: number
}

const DEFAULT_MAX_HEIGHT = 512

type LoadState = 'loading' | 'loaded' | 'error'

export function ChatImage(props: ChatImageProps) {
    const { src, alt = 'Image', maxHeight = DEFAULT_MAX_HEIGHT } = props
    const [loadState, setLoadState] = useState<LoadState>('loading')
    const [open, setOpen] = useState(false)
    const [isZoomed, setIsZoomed] = useState(false)
    const transformRef = useRef<ReactZoomPanPinchContentRef>(null)
    const { suppressFocusRing, onTriggerPointerDown, onTriggerKeyDown, onTriggerBlur } = usePointerFocusRing()

    useEffect(() => {
        setLoadState('loading')
    }, [src])

    // Sync global image modal state for gesture gating in App.tsx
    useEffect(() => {
        imageModalState.isOpen = open
        return () => { imageModalState.isOpen = false }
    }, [open])

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        if (!nextOpen) {
            // Reset zoom before closing
            transformRef.current?.resetTransform(0)
            setIsZoomed(false)
        }
        setOpen(nextOpen)
    }, [])

    const handleTransformed = useCallback((_ref: unknown, state: { scale: number }) => {
        setIsZoomed(state.scale > 1.05)
    }, [])

    // Block outside-click close while zoomed or actively interacting
    const handlePointerDownOutside = useCallback((e: Event) => {
        if (isZoomed) {
            e.preventDefault()
        }
    }, [isZoomed])

    const hasError = loadState === 'error'

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild disabled={hasError}>
                <button
                    type="button"
                    className={cn(
                        'group relative block w-fit max-w-full overflow-hidden rounded-lg bg-[var(--app-subtle-bg)]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]',
                        suppressFocusRing && 'focus-visible:ring-0',
                        hasError && 'cursor-not-allowed'
                    )}
                    aria-label={alt ? `View full size image: ${alt}` : 'View full size image'}
                    onPointerDown={onTriggerPointerDown}
                    onKeyDown={onTriggerKeyDown}
                    onBlur={onTriggerBlur}
                >
                    {loadState === 'loading' ? (
                        <div
                            data-testid="chat-image-skeleton"
                            className="h-32 w-32 animate-pulse bg-[var(--app-border)]"
                        />
                    ) : null}
                    {hasError ? (
                        <div className="flex min-h-32 min-w-48 items-center justify-center bg-[var(--app-subtle-bg)] px-4 py-6 text-[var(--app-hint)]">
                            <span aria-hidden="true" className="mr-2 text-base">
                                🖼️
                            </span>
                            <span className="text-sm">Image failed to load</span>
                        </div>
                    ) : (
                        <img
                            src={src}
                            alt={alt}
                            loading="lazy"
                            decoding="async"
                            className={cn(
                                'max-w-full rounded-lg object-contain',
                                loadState !== 'loaded' && 'hidden'
                            )}
                            style={{ maxHeight: `${maxHeight}px` }}
                            onLoad={() => setLoadState('loaded')}
                            onError={() => setLoadState('error')}
                        />
                    )}
                </button>
            </DialogTrigger>
            <DialogContent
                className="w-[95vw] max-w-[95vw] bg-[var(--app-secondary-bg)] p-3 sm:p-4"
                onPointerDownOutside={handlePointerDownOutside}
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>Image preview</DialogTitle>
                    <DialogDescription>Full size image preview</DialogDescription>
                </DialogHeader>
                <div className="relative flex items-center justify-center rounded-lg bg-[var(--app-subtle-bg)] p-2">
                    <button
                        type="button"
                        className="absolute right-2 top-2 z-10 rounded-md bg-black/50 p-1.5 text-white transition-opacity hover:opacity-80"
                        aria-label="Close image preview"
                        onClick={() => handleOpenChange(false)}
                    >
                        <CloseIcon className="h-4 w-4" />
                    </button>
                    <TransformWrapper
                        ref={transformRef}
                        minScale={1}
                        maxScale={5}
                        centerOnInit
                        doubleClick={{ mode: 'toggle', step: 2 }}
                        panning={{ disabled: !isZoomed }}
                        onTransformed={handleTransformed}
                    >
                        <TransformComponent
                            wrapperClass="image-zoom-wrapper"
                            contentClass="image-zoom-content"
                            wrapperStyle={{ width: '100%', height: '100%' }}
                        >
                            <img
                                src={src}
                                alt={alt}
                                loading="lazy"
                                decoding="async"
                                className="max-h-[85vh] max-w-full rounded-md object-contain"
                            />
                        </TransformComponent>
                    </TransformWrapper>
                </div>
            </DialogContent>
        </Dialog>
    )
}
