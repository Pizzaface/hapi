export function isExitSlashCommand(text: string): boolean {
    return text.trim().toLowerCase() === '/exit'
}
