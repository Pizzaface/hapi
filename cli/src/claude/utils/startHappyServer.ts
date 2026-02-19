/**
 * HAPI MCP server
 * Provides HAPI CLI specific tools including chat session title management
 * and session spawning
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { z } from "zod";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";
import { readRunnerState } from "@/persistence";
import { isProcessAlive } from "@/utils/process";

export async function startHappyServer(client: ApiSessionClient) {
    // Handler that sends title updates via the client
    const handler = async (title: string) => {
        logger.debug('[hapiMCP] Changing title to:', title);
        try {
            // Send title as a summary message, similar to title generator
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID()
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    //
    // Create the MCP server
    //

    const mcp = new McpServer({
        name: "HAPI MCP",
        version: "1.0.0",
    });

    // Avoid TS instantiation depth issues by widening the schema type.
    const changeTitleInputSchema: z.ZodTypeAny = z.object({
        title: z.string().describe('The new title for the chat session'),
    });

    mcp.registerTool<any, any>('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: changeTitleInputSchema,
    }, async (args: { title: string }) => {
        const response = await handler(args.title);
        logger.debug('[hapiMCP] Response:', response);
        
        if (response.success) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Successfully changed chat title to: "${args.title}"`,
                    },
                ],
                isError: false,
            };
        } else {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Failed to change chat title: ${response.error || 'Unknown error'}`,
                    },
                ],
                isError: true,
            };
        }
    });

    // Avoid TS instantiation depth issues by widening the schema type.
    const spawnSessionInputSchema: z.ZodTypeAny = z.object({
        directory: z.string().describe('The absolute path to the working directory for the new session'),
        sessionType: z.enum(['simple', 'worktree']).optional().describe('Session type: "simple" for a plain session, "worktree" for a git worktree-based session'),
        worktreeName: z.string().optional().describe('Name for the git worktree (only used when sessionType is "worktree")'),
        worktreeBranch: z.string().optional().describe('Branch name for the git worktree (only used when sessionType is "worktree")'),
    });

    mcp.registerTool<any, any>('spawn_session', {
        description: 'Spawn a new HAPI session on the local machine. Creates a new Claude Code session in the specified directory.',
        title: 'Spawn Session',
        inputSchema: spawnSessionInputSchema,
    }, async (args: { directory: string; sessionType?: string; worktreeName?: string; worktreeBranch?: string }) => {
        logger.debug('[hapiMCP] Spawning session:', args);
        try {
            const state = await readRunnerState();
            if (!state?.httpPort) {
                return {
                    content: [{ type: 'text' as const, text: 'Failed to spawn session: no runner is running (no state file found)' }],
                    isError: true,
                };
            }

            if (!isProcessAlive(state.pid)) {
                return {
                    content: [{ type: 'text' as const, text: 'Failed to spawn session: runner process is not running (stale state)' }],
                    isError: true,
                };
            }

            const response = await fetch(`http://127.0.0.1:${state.httpPort}/spawn-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    directory: args.directory,
                    sessionType: args.sessionType,
                    worktreeName: args.worktreeName,
                    worktreeBranch: args.worktreeBranch,
                }),
                signal: AbortSignal.timeout(30_000),
            });

            const result = await response.json() as Record<string, unknown>;
            logger.debug('[hapiMCP] Spawn result:', result);

            if (result.success && result.sessionId) {
                return {
                    content: [{ type: 'text' as const, text: `Session spawned successfully. Session ID: ${result.sessionId}` }],
                    isError: false,
                };
            }

            const errorMsg = result.error || result.actionRequired || 'Unknown error';
            return {
                content: [{ type: 'text' as const, text: `Failed to spawn session: ${errorMsg}` }],
                isError: true,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.debug('[hapiMCP] Spawn error:', error);
            return {
                content: [{ type: 'text' as const, text: `Failed to spawn session: ${errorMsg}` }],
                isError: true,
            };
        }
    });

    const transport = new StreamableHTTPServerTransport({
        // NOTE: Returning session id here will result in claude
        // sdk spawn to fail with `Invalid Request: Server already initialized`
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    //
    // Create the HTTP server
    //

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title', 'spawn_session'],
        stop: () => {
            logger.debug('[hapiMCP] Stopping server');
            mcp.close();
            server.close();
        }
    }
}
