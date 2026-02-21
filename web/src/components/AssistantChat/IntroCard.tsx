import type { PermissionMode, ModelMode, WorktreeMetadata } from '@/types/api'
import { getPermissionModeLabel, getModelModesForFlavor, MODEL_MODE_LABELS } from '@hapi/protocol'
import { cn } from '@/lib/utils'

export type IntroCardProps = {
    flavor?: string | null
    permissionMode?: PermissionMode
    modelMode?: ModelMode
    path?: string
    worktree?: WorktreeMetadata
    startedBy?: 'runner' | 'terminal'
    startedFromRunner?: boolean
}

function shortenPath(path: string): string {
    const segments = path.split('/').filter(Boolean)
    if (segments.length <= 1) return path
    return segments.slice(-2).join('/')
}

function capitalizeFlavor(flavor: string): string {
    return flavor.charAt(0).toUpperCase() + flavor.slice(1)
}

function Chip(props: { testId: string; children: React.ReactNode; className?: string }) {
    return (
        <span
            data-testid={props.testId}
            className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs',
                'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]',
                props.className
            )}
        >
            {props.children}
        </span>
    )
}

export function IntroCard(props: IntroCardProps) {
    const isSpawned = props.startedBy === 'runner' || props.startedFromRunner === true
    const showModelMode =
        !isSpawned &&
        props.modelMode &&
        props.modelMode !== 'default' &&
        getModelModesForFlavor(props.flavor).length > 0

    const chips: React.ReactNode[] = []

    if (isSpawned) {
        chips.push(
            <Chip key="spawned" testId="intro-spawned" className="bg-[var(--app-badge-warning-bg)] text-[var(--app-badge-warning-text)]">
                Spawned
            </Chip>
        )
    }

    if (props.flavor) {
        chips.push(
            <Chip key="flavor" testId="intro-flavor">
                {capitalizeFlavor(props.flavor)}
            </Chip>
        )
    }

    if (!isSpawned && props.permissionMode) {
        chips.push(
            <Chip key="permission" testId="intro-permission">
                {getPermissionModeLabel(props.permissionMode)}
            </Chip>
        )
    }

    if (showModelMode) {
        chips.push(
            <Chip key="model" testId="intro-model">
                {MODEL_MODE_LABELS[props.modelMode!]}
            </Chip>
        )
    }

    if (props.path) {
        chips.push(
            <Chip key="path" testId="intro-path">
                {shortenPath(props.path)}
            </Chip>
        )
    }

    if (props.worktree?.branch) {
        chips.push(
            <Chip key="branch" testId="intro-branch">
                {props.worktree.branch}
            </Chip>
        )
    }

    if (chips.length === 0) return null

    return (
        <div className="mx-auto w-full max-w-content flex flex-wrap items-center gap-1.5 px-3 pt-2 pb-1">
            {chips}
        </div>
    )
}
