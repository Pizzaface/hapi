import { resolveProvider, type ProviderKey } from '@/lib/providerTheme'

type ProviderIconProps = {
    flavor?: string | null
    className?: string
}

type ProviderGlyphProps = {
    color: string
}

function ClaudeGlyph(props: ProviderGlyphProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            style={{ color: props.color }}
            aria-hidden="true"
        >
            <polygon points="8 1.5 14.5 8 8 14.5 1.5 8" fill="currentColor" />
        </svg>
    )
}

function CodexGlyph(props: ProviderGlyphProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            style={{ color: props.color }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <polygon points="8 1.5 13.8 4.8 13.8 11.2 8 14.5 2.2 11.2 2.2 4.8" />
            <path d="M6.2 5.6L4.8 8L6.2 10.4" />
            <path d="M9.8 5.6L11.2 8L9.8 10.4" />
        </svg>
    )
}

function GeminiGlyph(props: ProviderGlyphProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            style={{ color: props.color }}
            aria-hidden="true"
        >
            <path d="M8 1.5L9.8 5.7L14.5 8L9.8 10.3L8 14.5L6.2 10.3L1.5 8L6.2 5.7L8 1.5Z" fill="currentColor" />
        </svg>
    )
}

function OpenCodeGlyph(props: ProviderGlyphProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            style={{ color: props.color }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M5.8 4.8L2.8 8L5.8 11.2" />
            <path d="M10.2 4.8L13.2 8L10.2 11.2" />
            <path d="M6.6 12.7H9.4" />
        </svg>
    )
}

function UnknownGlyph(props: ProviderGlyphProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            style={{ color: props.color }}
            aria-hidden="true"
        >
            <circle cx="8" cy="8" r="4.5" fill="currentColor" />
        </svg>
    )
}

function renderGlyph(key: ProviderKey, color: string) {
    if (key === 'claude') return <ClaudeGlyph color={color} />
    if (key === 'codex') return <CodexGlyph color={color} />
    if (key === 'gemini') return <GeminiGlyph color={color} />
    if (key === 'opencode') return <OpenCodeGlyph color={color} />
    return <UnknownGlyph color={color} />
}

export function ProviderIcon(props: ProviderIconProps) {
    const provider = resolveProvider(props.flavor)
    const color = `var(${provider.colorVar})`

    return (
        <span
            data-provider-key={provider.key}
            className={`flex h-4 w-4 items-center justify-center ${props.className ?? ''}`.trim()}
        >
            {renderGlyph(provider.key, color)}
        </span>
    )
}
