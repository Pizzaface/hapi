import '@testing-library/jest-dom/vitest'

// Polyfill ResizeObserver for jsdom (needed by react-zoom-pan-pinch)
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}
