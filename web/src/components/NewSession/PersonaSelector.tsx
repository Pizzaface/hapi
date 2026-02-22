import { useMemo } from 'react'
import type { MachineAgent } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'
import type { AgentType } from './types'

export function PersonaSelector(props: {
    agent: AgentType
    personas: MachineAgent[]
    persona: string | null
    isDisabled: boolean
    onPersonaChange: (persona: string | null) => void
}) {
    const { t } = useTranslation()

    const options = useMemo(() => {
        return [
            {
                key: 'persona:none',
                value: null,
                label: t('newSession.persona.none'),
                description: t('newSession.persona.none.desc')
            },
            ...props.personas.map((persona) => ({
                key: `persona:${persona.name}`,
                value: persona.name,
                label: persona.name,
                description: persona.description
            }))
        ]
    }, [props.personas, t])

    if (props.agent !== 'claude' || props.personas.length === 0) {
        return null
    }

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.persona')}
            </label>
            <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                    const isSelected = props.persona === option.value
                    return (
                        <button
                            key={option.key}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={props.isDisabled}
                            onClick={() => props.onPersonaChange(option.value)}
                            className={`min-w-[120px] rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                                isSelected
                                    ? 'border-[var(--app-link)] bg-[var(--app-secondary-bg)]'
                                    : 'border-[var(--app-border)] bg-[var(--app-bg)] hover:bg-[var(--app-secondary-bg)]'
                            }`}
                        >
                            <div className="text-sm font-medium text-[var(--app-fg)]">
                                {option.label}
                            </div>
                            {option.description ? (
                                <div className="mt-1 text-xs text-[var(--app-hint)]">
                                    {option.description}
                                </div>
                            ) : null}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
