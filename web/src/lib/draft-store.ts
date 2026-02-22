/**
 * In-memory draft store for preserving composer text across session switches.
 * Keyed by sessionId — drafts survive navigation but not page reload.
 */
const drafts = new Map<string, string>()

export function getDraft(sessionId: string): string {
    return drafts.get(sessionId) ?? ''
}

export function setDraft(sessionId: string, text: string): void {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
        drafts.delete(sessionId)
    } else {
        drafts.set(sessionId, text)
    }
}

export function clearDraft(sessionId: string): void {
    drafts.delete(sessionId)
}
