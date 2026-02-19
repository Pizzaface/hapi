import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexMcpClient } from './codexMcpClient';

// Mock logger to avoid cluttering test output
vi.mock('@/ui/logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

// Mock process utils
vi.mock('@/utils/process', () => ({
    isProcessAlive: vi.fn(),
    killProcess: vi.fn()
}));

// Mock executable util
vi.mock('./utils/executable', () => ({
    getDefaultCodexPath: vi.fn().mockReturnValue('/mock/path/to/codex')
}));

// Mock child_process to avoid actual execution during getCodexMcpCommand
vi.mock('child_process', () => ({
    execFileSync: vi.fn().mockReturnValue('codex-cli 0.44.0'),
}));


describe('CodexMcpClient Identifier Extraction', () => {
    let client: any;

    beforeEach(() => {
        // Instantiate the client. Dependencies are mocked.
        client = new CodexMcpClient();
    });

    it('should extract identifiers from meta', () => {
        const response = {
            meta: {
                sessionId: 'sess-1',
                conversationId: 'conv-1',
                threadId: 'thread-1',
            },
        };

        client.extractIdentifiers(response);

        expect(client.getSessionId()).toBe('sess-1');
        expect(client.conversationId).toBe('conv-1');
        expect(client.threadId).toBe('thread-1');
    });

    it('should extract identifiers from response root if not in meta', () => {
        const response = {
            sessionId: 'sess-2',
            conversationId: 'conv-2',
            threadId: 'thread-2',
        };

        client.extractIdentifiers(response);

        expect(client.getSessionId()).toBe('sess-2');
        expect(client.conversationId).toBe('conv-2');
        expect(client.threadId).toBe('thread-2');
    });

    it('should prioritize meta over response root', () => {
        const response = {
            meta: {
                sessionId: 'sess-meta',
                conversationId: 'conv-meta',
                threadId: 'thread-meta',
            },
            sessionId: 'sess-root',
            conversationId: 'conv-root',
            threadId: 'thread-root',
        };

        client.extractIdentifiers(response);

        expect(client.getSessionId()).toBe('sess-meta');
        expect(client.conversationId).toBe('conv-meta');
        expect(client.threadId).toBe('thread-meta');
    });

    it('should extract threadId from structuredContent and overwrite meta/root', () => {
        const response = {
            meta: {
                threadId: 'thread-meta',
            },
            threadId: 'thread-root',
            structuredContent: {
                threadId: 'thread-structured',
            },
        };

        client.extractIdentifiers(response);

        expect(client.threadId).toBe('thread-structured');
    });

    it('should extract sessionId/conversationId from content array if not set', () => {
        const response = {
            content: [
                { sessionId: 'sess-content', conversationId: 'conv-content' },
            ],
        };

        client.extractIdentifiers(response);

        expect(client.getSessionId()).toBe('sess-content');
        expect(client.conversationId).toBe('conv-content');
    });

    it('should not overwrite existing sessionId/conversationId from content array', () => {
        const response = {
            meta: {
                sessionId: 'sess-meta',
                conversationId: 'conv-meta',
            },
            content: [
                { sessionId: 'sess-content', conversationId: 'conv-content' },
            ],
        };

        client.extractIdentifiers(response);

        expect(client.getSessionId()).toBe('sess-meta');
        expect(client.conversationId).toBe('conv-meta');
    });

    // Additional tests for updateIdentifiersFromEvent
     it('should update identifiers from event', () => {
        const event = {
            session_id: 'sess-event',
            conversation_id: 'conv-event',
            thread_id: 'thread-event',
        };

        client.updateIdentifiersFromEvent(event);

        expect(client.getSessionId()).toBe('sess-event');
        expect(client.conversationId).toBe('conv-event');
        expect(client.threadId).toBe('thread-event');
    });

     it('should update identifiers from event data object', () => {
        const event = {
            data: {
                sessionId: 'sess-data',
                conversationId: 'conv-data',
                threadId: 'thread-data',
            }
        };

        client.updateIdentifiersFromEvent(event);

        expect(client.getSessionId()).toBe('sess-data');
        expect(client.conversationId).toBe('conv-data');
        expect(client.threadId).toBe('thread-data');
    });

});
