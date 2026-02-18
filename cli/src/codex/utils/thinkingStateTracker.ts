const DEFAULT_SETTLE_DELAY_MS = 300

const THINKING_ACTIVITY_EVENT_TYPES = new Set<string>([
    'event_msg',
    'response_item',
    'session_meta',
    'agent_message',
    'agent_reasoning_delta',
    'agent_reasoning',
    'exec_command_begin',
    'exec_command_end',
    'exec_approval_request',
    'patch_apply_begin',
    'patch_apply_end',
    'turn_diff',
    'turn_plan_updated',
    'plan_delta',
    'mcp_tool_call_begin',
    'mcp_tool_call_end',
    'web_search_begin',
    'web_search_end',
    'task_started'
])

export function isCodexThinkingActivityEvent(eventType: string): boolean {
    return THINKING_ACTIVITY_EVENT_TYPES.has(eventType)
}

export class ThinkingStateTracker {
    private readonly onThinkingChange: (thinking: boolean) => void
    private readonly getThinking: () => boolean
    private readonly settleDelayMs: number

    private settlePending = false
    private settleTimer: ReturnType<typeof setTimeout> | null = null

    constructor(options: {
        onThinkingChange: (thinking: boolean) => void
        getThinking: () => boolean
        settleDelayMs?: number
    }) {
        this.onThinkingChange = options.onThinkingChange
        this.getThinking = options.getThinking
        this.settleDelayMs = options.settleDelayMs ?? DEFAULT_SETTLE_DELAY_MS
    }

    startProcessing(): void {
        this.settlePending = false
        this.clearSettleTimer()
        this.setThinking(true)
    }

    markActivity(): void {
        this.setThinking(true)

        if (this.settlePending) {
            this.scheduleSettle()
        }
    }

    markSettledSoon(): void {
        if (!this.getThinking()) {
            this.settlePending = false
            this.clearSettleTimer()
            return
        }

        this.settlePending = true
        this.scheduleSettle()
    }

    reset(): void {
        this.settlePending = false
        this.clearSettleTimer()
        this.setThinking(false)
    }

    dispose(): void {
        this.reset()
    }

    private scheduleSettle(): void {
        this.clearSettleTimer()

        this.settleTimer = setTimeout(() => {
            this.settleTimer = null
            this.settlePending = false
            this.setThinking(false)
        }, this.settleDelayMs)
    }

    private clearSettleTimer(): void {
        if (this.settleTimer) {
            clearTimeout(this.settleTimer)
            this.settleTimer = null
        }
    }

    private setThinking(nextThinking: boolean): void {
        if (this.getThinking() === nextThinking) {
            return
        }

        this.onThinkingChange(nextThinking)
    }
}
